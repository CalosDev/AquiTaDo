import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
    OrganizationRole,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
    CreateAdsWalletCheckoutSessionDto,
    CreateBookingCheckoutSessionDto,
} from './dto/payment.dto';
import {
    asJson,
    mergeJsonObject,
    resolveBookingChargeAmount,
    resolveStringId,
    roundMoney,
} from './payments.helpers';
import { PaymentsReportingService } from './payments-reporting.service';
import { PaymentsWebhookService } from './payments-webhook.service';

@Injectable()
export class PaymentsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(SubscriptionsService)
        private readonly subscriptionsService: SubscriptionsService,
        @Inject(CircuitBreakerService)
        private readonly circuitBreaker: CircuitBreakerService,
        @Inject(PaymentsReportingService)
        private readonly paymentsReportingService: PaymentsReportingService,
        @Inject(PaymentsWebhookService)
        private readonly paymentsWebhookService: PaymentsWebhookService,
    ) { }

    async listMyPayments(organizationId: string, limit = 50) {
        const boundedLimit = Math.min(Math.max(limit, 1), 200);
        return this.prisma.payment.findMany({
            where: { organizationId },
            include: {
                subscription: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: boundedLimit,
        });
    }

    async listMyInvoices(organizationId: string, limit = 50) {
        const boundedLimit = Math.min(Math.max(limit, 1), 200);
        return this.prisma.invoice.findMany({
            where: { organizationId },
            include: {
                subscription: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
            orderBy: { issuedAt: 'desc' },
            take: boundedLimit,
        });
    }

    async getAdsWalletOverview(organizationId: string, limit = 20) {
        const boundedLimit = Math.min(Math.max(limit, 1), 100);
        const [organization, topups] = await Promise.all([
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: {
                    id: true,
                    adWalletBalance: true,
                },
            }),
            this.prisma.adWalletTopup.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take: boundedLimit,
            }),
        ]);

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        return {
            organizationId,
            balance: Number(organization.adWalletBalance.toString()),
            topups: topups.map((topup) => ({
                ...topup,
                amount: Number(topup.amount.toString()),
            })),
        };
    }

    async createAdsWalletCheckoutSession(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
        dto: CreateAdsWalletCheckoutSessionDto,
    ) {
        await this.assertCanManageBilling(organizationId, actorUserId, actorGlobalRole);

        const stripe = this.resolveStripeClient();
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount < 1) {
            throw new BadRequestException('Monto de recarga inválido');
        }

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                ownerUser: {
                    select: {
                        email: true,
                        name: true,
                    },
                },
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        const subscription = await this.subscriptionsService.ensureSubscriptionForOrganization(organizationId);

        let customerId = subscription?.providerCustomerId ?? null;
        if (!customerId) {
            const customer = await this.circuitBreaker.execute('stripe', () =>
                stripe.customers.create({
                    email: organization.ownerUser.email,
                    name: organization.ownerUser.name,
                    metadata: {
                        organizationId,
                    },
                }),
            );
            customerId = customer.id;

            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    providerCustomerId: customerId,
                },
            });
        }

        const topup = await this.prisma.adWalletTopup.create({
            data: {
                organizationId,
                requestedByUserId: actorUserId,
                provider: 'stripe',
                amount: amount.toFixed(2),
                currency: 'DOP',
                status: 'PENDING',
            },
            select: {
                id: true,
            },
        });

        try {
            const checkoutSession = await this.circuitBreaker.execute('stripe', () =>
                stripe.checkout.sessions.create({
                mode: 'payment',
                customer: customerId,
                success_url: dto.successUrl,
                cancel_url: dto.cancelUrl,
                line_items: [
                    {
                        price_data: {
                            currency: 'dop',
                            unit_amount: Math.round(amount * 100),
                            product_data: {
                                name: 'AquiTa.do Ads Wallet Top-up',
                                description: 'Recarga de saldo publicitario para campañas CPC',
                            },
                        },
                        quantity: 1,
                    },
                ],
                metadata: {
                    paymentType: 'AD_WALLET_TOPUP',
                    organizationId,
                    topupId: topup.id,
                },
                }),
            );

            await this.prisma.adWalletTopup.update({
                where: { id: topup.id },
                data: {
                    providerCheckoutSessionId: checkoutSession.id,
                },
            });

            return {
                topupId: topup.id,
                sessionId: checkoutSession.id,
                checkoutUrl: checkoutSession.url,
            };
        } catch (error) {
            await this.prisma.adWalletTopup.update({
                where: { id: topup.id },
                data: {
                    status: 'FAILED',
                    failureReason: error instanceof Error
                        ? error.message.slice(0, 255)
                        : 'No se pudo crear sesión de pago',
                },
            });
            throw error;
        }
    }

    async createBookingCheckoutSession(
        bookingId: string,
        actorUserId: string,
        actorGlobalRole: string,
        dto: CreateBookingCheckoutSessionDto,
    ) {
        const stripe = this.resolveStripeClient();
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            select: {
                id: true,
                organizationId: true,
                businessId: true,
                userId: true,
                promotionId: true,
                status: true,
                scheduledFor: true,
                quotedAmount: true,
                depositAmount: true,
                currency: true,
                business: {
                    select: {
                        name: true,
                    },
                },
                user: {
                    select: {
                        email: true,
                    },
                },
                organization: {
                    select: {
                        ownerUserId: true,
                        ownerUser: {
                            select: {
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }

        if (booking.status === 'CANCELED' || booking.status === 'NO_SHOW') {
            throw new BadRequestException('La reserva no permite cobro');
        }

        const chargeAmount = resolveBookingChargeAmount(
            booking.quotedAmount,
            booking.depositAmount,
        );
        if (chargeAmount <= 0) {
            throw new BadRequestException('La reserva no tiene monto para cobrar');
        }

        await this.assertCanCreateBookingPayment(booking, actorUserId, actorGlobalRole);

        const currency = (booking.currency || 'DOP').trim().toUpperCase();
        const paymentContext = await this.prisma.$transaction(async (tx) => {
            const latestTransaction = await tx.transaction.findFirst({
                where: { bookingId: booking.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    status: true,
                    paymentId: true,
                },
            });

            if (latestTransaction?.status === 'SUCCEEDED') {
                throw new BadRequestException('La reserva ya tiene un pago confirmado');
            }

            if (latestTransaction?.paymentId) {
                await tx.payment.updateMany({
                    where: {
                        id: latestTransaction.paymentId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'CANCELED',
                        failureReason: 'Checkout reemplazado por una nueva sesión',
                    },
                });
            }

            const feeBps = await this.resolveTransactionFeeBps(tx, booking.organizationId);
            const platformFeeAmount = roundMoney((chargeAmount * feeBps) / 10_000);
            const netAmount = roundMoney(chargeAmount - platformFeeAmount);

            const payment = await tx.payment.create({
                data: {
                    organizationId: booking.organizationId,
                    provider: 'stripe',
                    amount: String(chargeAmount),
                    currency,
                    status: 'PENDING',
                    metadata: asJson({
                        paymentType: 'BOOKING_PAYMENT',
                        bookingId: booking.id,
                    }),
                },
                select: {
                    id: true,
                },
            });

            let transactionId: string;
            if (latestTransaction) {
                await tx.transaction.update({
                    where: { id: latestTransaction.id },
                    data: {
                        paymentId: payment.id,
                        grossAmount: String(chargeAmount),
                        platformFeeAmount: String(platformFeeAmount),
                        netAmount: String(netAmount),
                        currency,
                        status: 'PENDING',
                        paidAt: null,
                        providerReference: null,
                    },
                });
                transactionId = latestTransaction.id;
            } else {
                const createdTransaction = await tx.transaction.create({
                    data: {
                        organizationId: booking.organizationId,
                        businessId: booking.businessId,
                        bookingId: booking.id,
                        promotionId: booking.promotionId,
                        buyerUserId: booking.userId,
                        paymentId: payment.id,
                        grossAmount: String(chargeAmount),
                        platformFeeAmount: String(platformFeeAmount),
                        netAmount: String(netAmount),
                        currency,
                        status: 'PENDING',
                    },
                    select: {
                        id: true,
                    },
                });
                transactionId = createdTransaction.id;
            }

            return {
                paymentId: payment.id,
                transactionId,
            };
        });

        const metadata = {
            paymentType: 'BOOKING_PAYMENT',
            organizationId: booking.organizationId,
            bookingId: booking.id,
            paymentId: paymentContext.paymentId,
            transactionId: paymentContext.transactionId,
        };

        try {
            const checkoutSession = await this.circuitBreaker.execute('stripe', () =>
                stripe.checkout.sessions.create({
                    mode: 'payment',
                    success_url: dto.successUrl,
                    cancel_url: dto.cancelUrl,
                    customer_email: booking.user?.email ?? booking.organization.ownerUser.email ?? undefined,
                    line_items: [
                        {
                            price_data: {
                                currency: currency.toLowerCase(),
                                unit_amount: Math.round(chargeAmount * 100),
                                product_data: {
                                    name: 'AquiTa.do Marketplace Booking',
                                    description: `Cobro de reserva para ${booking.business.name}`,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    metadata,
                    payment_intent_data: {
                        metadata,
                    },
                }),
            );

            const paymentIntentId = resolveStringId(checkoutSession.payment_intent);

            await this.prisma.$transaction(async (tx) => {
                const payment = await tx.payment.findUnique({
                    where: { id: paymentContext.paymentId },
                    select: {
                        metadata: true,
                    },
                });

                await tx.payment.update({
                    where: { id: paymentContext.paymentId },
                    data: {
                        providerPaymentIntentId: paymentIntentId ?? undefined,
                        metadata: mergeJsonObject(payment?.metadata, {
                            ...metadata,
                            checkoutSessionId: checkoutSession.id,
                        }),
                    },
                });

                await tx.transaction.update({
                    where: { id: paymentContext.transactionId },
                    data: {
                        providerReference: checkoutSession.id,
                    },
                });
            });

            return {
                bookingId: booking.id,
                paymentId: paymentContext.paymentId,
                transactionId: paymentContext.transactionId,
                sessionId: checkoutSession.id,
                checkoutUrl: checkoutSession.url,
            };
        } catch (error) {
            const failureReason = error instanceof Error
                ? error.message.slice(0, 255)
                : 'No se pudo crear la sesión de pago';

            await this.prisma.$transaction(async (tx) => {
                await tx.payment.updateMany({
                    where: {
                        id: paymentContext.paymentId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'FAILED',
                        failureReason,
                    },
                });

                await tx.transaction.updateMany({
                    where: {
                        id: paymentContext.transactionId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'FAILED',
                    },
                });
            });

            throw error;
        }
    }

    async getBillingSummary(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        return this.paymentsReportingService.getBillingSummary(organizationId, from, to);
    }

    async exportInvoicesCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        return this.paymentsReportingService.exportInvoicesCsv(organizationId, from, to);
    }

    async exportPaymentsCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        return this.paymentsReportingService.exportPaymentsCsv(organizationId, from, to);
    }

    async getFiscalSummary(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        return this.paymentsReportingService.getFiscalSummary(organizationId, from, to);
    }

    async exportFiscalCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        return this.paymentsReportingService.exportFiscalCsv(organizationId, from, to);
    }

    async handleStripeWebhook(signature: string | undefined, body: unknown) {
        return this.paymentsWebhookService.handleStripeWebhook(signature, body);
    }

    private async assertCanManageBilling(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
    ) {
        if (actorGlobalRole === 'ADMIN') {
            return;
        }

        const membership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: actorUserId,
                },
            },
            select: {
                role: true,
            },
        });

        if (!membership) {
            throw new ForbiddenException('No tienes acceso a esta organizacion');
        }

        if (membership.role !== OrganizationRole.OWNER) {
            throw new ForbiddenException('Solo el owner puede gestionar la facturacion');
        }
    }

    private async assertCanCreateBookingPayment(
        booking: {
            organizationId: string;
            userId: string | null;
            organization: {
                ownerUserId: string;
            };
        },
        actorUserId: string,
        actorGlobalRole: string,
    ) {
        if (actorGlobalRole === 'ADMIN') {
            return;
        }

        if (booking.userId === actorUserId) {
            return;
        }

        if (booking.organization.ownerUserId === actorUserId) {
            return;
        }

        const membership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: booking.organizationId,
                    userId: actorUserId,
                },
            },
            select: {
                role: true,
            },
        });

        if (!membership) {
            throw new ForbiddenException('No tienes acceso a esta reserva');
        }

        if (membership.role === OrganizationRole.STAFF) {
            throw new ForbiddenException('El rol STAFF no puede gestionar cobros');
        }
    }

    private async resolveTransactionFeeBps(
        tx: Prisma.TransactionClient,
        organizationId: string,
    ): Promise<number> {
        const subscription = await tx.subscription.findUnique({
            where: { organizationId },
            include: {
                plan: {
                    select: {
                        transactionFeeBps: true,
                    },
                },
            },
        });

        if (subscription?.plan) {
            return subscription.plan.transactionFeeBps;
        }

        const organization = await tx.organization.findUnique({
            where: { id: organizationId },
            select: {
                plan: true,
            },
        });

        if (!organization) {
            return 1200;
        }

        const plan = await tx.plan.findUnique({
            where: { code: organization.plan },
            select: {
                transactionFeeBps: true,
            },
        });

        return plan?.transactionFeeBps ?? 1200;
    }

    private resolveStripeClient(): Stripe {
        const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY')?.trim();
        if (!stripeSecretKey) {
            throw new ServiceUnavailableException('Stripe no esta configurado en este entorno');
        }

        return new Stripe(stripeSecretKey);
    }
}

