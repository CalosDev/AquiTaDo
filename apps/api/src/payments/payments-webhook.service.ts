import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma } from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
    asJson,
    mapStripeStatus,
    mapSubscriptionToOrganizationStatus,
    mergeJsonObject,
    normalizeRawBody,
    resolvePlanCode,
    resolveStringId,
    roundMoney,
} from './payments.helpers';

@Injectable()
export class PaymentsWebhookService {
    private readonly logger = new Logger(PaymentsWebhookService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(PlansService)
        private readonly plansService: PlansService,
        @Inject(SubscriptionsService)
        private readonly subscriptionsService: SubscriptionsService,
        @Inject(CircuitBreakerService)
        private readonly circuitBreaker: CircuitBreakerService,
    ) { }

    async handleStripeWebhook(signature: string | undefined, body: unknown) {
        const event = await this.resolveStripeEvent(signature, body);

        const existing = await this.prisma.webhookEvent.findUnique({
            where: {
                provider_externalEventId: {
                    provider: 'STRIPE',
                    externalEventId: event.id,
                },
            },
            select: { id: true },
        });

        if (existing) {
            return { received: true, deduplicated: true };
        }

        const webhookLog = await this.prisma.webhookEvent.create({
            data: {
                provider: 'STRIPE',
                externalEventId: event.id,
                eventType: event.type,
                signature: signature ?? null,
                payload: asJson(event),
                processingStatus: 'RECEIVED',
            },
        });

        try {
            await this.processStripeEvent(event);

            await this.prisma.webhookEvent.update({
                where: { id: webhookLog.id },
                data: {
                    processingStatus: 'PROCESSED',
                    processedAt: new Date(),
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown webhook error';
            this.logger.error(`stripe.webhook.failed id=${event.id} type=${event.type} error=${message}`);

            await this.prisma.webhookEvent.update({
                where: { id: webhookLog.id },
                data: {
                    processingStatus: 'FAILED',
                    errorMessage: message.slice(0, 500),
                    processedAt: new Date(),
                },
            });

            throw error;
        }

        return { received: true, deduplicated: false };
    }

    private async processStripeEvent(event: Stripe.Event) {
        switch (event.type) {
            case 'checkout.session.completed':
                await this.processCheckoutSessionCompleted(
                    event.data.object as Stripe.Checkout.Session,
                );
                return;
            case 'checkout.session.expired':
                await this.processCheckoutSessionExpired(
                    event.data.object as Stripe.Checkout.Session,
                );
                return;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await this.processSubscriptionChanged(
                    event.data.object as Stripe.Subscription,
                );
                return;
            case 'invoice.payment_succeeded':
                await this.processInvoicePaymentSucceeded(
                    event.data.object as Stripe.Invoice,
                );
                return;
            case 'invoice.payment_failed':
                await this.processInvoicePaymentFailed(
                    event.data.object as Stripe.Invoice,
                );
                return;
            case 'payment_intent.payment_failed':
                await this.processPaymentIntentFailed(
                    event.data.object as Stripe.PaymentIntent,
                );
                return;
            default:
                this.logger.debug(`stripe.webhook.ignored type=${event.type}`);
        }
    }

    private async processCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
        if (session.metadata?.paymentType === 'AD_WALLET_TOPUP') {
            await this.processAdWalletTopupCompleted(session);
            return;
        }

        if (session.metadata?.paymentType === 'BOOKING_PAYMENT') {
            await this.processBookingPaymentCompleted(session);
            return;
        }

        const organizationId = session.metadata?.organizationId;
        if (!organizationId) {
            return;
        }

        await this.plansService.syncDefaultPlans();
        const selectedPlanCode = resolvePlanCode(session.metadata?.planCode);
        const selectedPlan = selectedPlanCode
            ? await this.prisma.plan.findUnique({ where: { code: selectedPlanCode } })
            : null;

        const subscription = await this.subscriptionsService.ensureSubscriptionForOrganization(organizationId);
        const providerSubscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null;
        const providerCustomerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: 'ACTIVE',
                providerSubscriptionId: providerSubscriptionId ?? subscription.providerSubscriptionId,
                providerCustomerId: providerCustomerId ?? subscription.providerCustomerId,
                planId: selectedPlan?.id ?? subscription.planId,
            },
        });

        await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                plan: selectedPlan?.code ?? subscription.plan.code,
                subscriptionStatus: 'ACTIVE',
            },
        });
    }

    private async processCheckoutSessionExpired(session: Stripe.Checkout.Session) {
        if (session.metadata?.paymentType === 'BOOKING_PAYMENT') {
            await this.processBookingPaymentExpired(session);
            return;
        }

        if (session.metadata?.paymentType !== 'AD_WALLET_TOPUP') {
            return;
        }

        const topupId = session.metadata?.topupId;
        if (!topupId) {
            return;
        }

        await this.prisma.adWalletTopup.updateMany({
            where: {
                id: topupId,
                status: 'PENDING',
            },
            data: {
                status: 'CANCELED',
                failureReason: 'Sesion de pago expirada',
                metadata: asJson(session),
            },
        });
    }

    private async processAdWalletTopupCompleted(session: Stripe.Checkout.Session) {
        const topupId = session.metadata?.topupId;
        const organizationId = session.metadata?.organizationId;
        if (!topupId || !organizationId) {
            return;
        }

        const topup = await this.prisma.adWalletTopup.findUnique({
            where: { id: topupId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                amount: true,
            },
        });

        if (!topup || topup.organizationId !== organizationId) {
            return;
        }

        if (topup.status !== 'PENDING') {
            return;
        }

        const paymentIntentId = resolveStringId(session.payment_intent);
        const paidAmount = Number.isFinite(session.amount_total ?? NaN)
            ? (session.amount_total ?? 0) / 100
            : Number(topup.amount.toString());
        const currency = (session.currency ?? 'dop').toUpperCase();
        const paidAt = new Date();

        await this.prisma.$transaction(async (tx) => {
            const updatedTopup = await tx.adWalletTopup.updateMany({
                where: {
                    id: topupId,
                    status: 'PENDING',
                },
                data: {
                    status: 'SUCCEEDED',
                    providerPaymentIntentId: paymentIntentId,
                    paidAt,
                    metadata: asJson(session),
                },
            });

            if (updatedTopup.count !== 1) {
                return;
            }

            await tx.organization.update({
                where: { id: organizationId },
                data: {
                    adWalletBalance: {
                        increment: paidAmount.toFixed(2),
                    },
                },
            });

            await tx.payment.create({
                data: {
                    organizationId,
                    provider: 'stripe',
                    providerPaymentIntentId: paymentIntentId,
                    amount: paidAmount.toFixed(2),
                    currency,
                    status: 'SUCCEEDED',
                    paidAt,
                    metadata: ({
                        paymentType: 'AD_WALLET_TOPUP',
                        topupId,
                        checkoutSessionId: session.id,
                    } as Prisma.InputJsonValue),
                },
            });
        });
    }

    private async processBookingPaymentCompleted(session: Stripe.Checkout.Session) {
        const paymentId = session.metadata?.paymentId;
        const bookingId = session.metadata?.bookingId;
        const organizationId = session.metadata?.organizationId;
        const transactionId = session.metadata?.transactionId ?? null;
        if (!paymentId || !bookingId || !organizationId) {
            return;
        }

        const paymentIntentId = resolveStringId(session.payment_intent);
        const amountFromStripe = Number.isFinite(session.amount_total ?? NaN)
            ? Math.max((session.amount_total ?? 0) / 100, 0)
            : null;
        const paidAt = new Date();
        const currency = (session.currency ?? 'dop').toUpperCase();

        await this.prisma.$transaction(async (tx) => {
            const [payment, booking] = await Promise.all([
                tx.payment.findUnique({
                    where: { id: paymentId },
                    select: {
                        id: true,
                        organizationId: true,
                        status: true,
                        amount: true,
                        metadata: true,
                    },
                }),
                tx.booking.findUnique({
                    where: { id: bookingId },
                    select: {
                        id: true,
                        organizationId: true,
                        businessId: true,
                        promotionId: true,
                        userId: true,
                        status: true,
                        currency: true,
                    },
                }),
            ]);

            if (!payment || !booking) {
                return;
            }

            if (payment.organizationId !== organizationId || booking.organizationId !== organizationId) {
                return;
            }

            if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') {
                return;
            }

            const grossAmount = roundMoney(
                amountFromStripe !== null && amountFromStripe > 0
                    ? amountFromStripe
                    : Number(payment.amount.toString()),
            );

            const feeBps = await this.resolveTransactionFeeBps(tx, organizationId);
            const platformFeeAmount = roundMoney((grossAmount * feeBps) / 10_000);
            const netAmount = roundMoney(grossAmount - platformFeeAmount);

            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    providerPaymentIntentId: paymentIntentId ?? undefined,
                    amount: String(grossAmount),
                    currency,
                    status: 'SUCCEEDED',
                    paidAt,
                    failureReason: null,
                    metadata: mergeJsonObject(payment.metadata, {
                        paymentType: 'BOOKING_PAYMENT',
                        bookingId,
                        transactionId,
                        checkoutSessionId: session.id,
                    }),
                },
            });

            let targetTransactionId = transactionId;
            if (!targetTransactionId) {
                const latestTransaction = await tx.transaction.findFirst({
                    where: { bookingId: booking.id },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true },
                });
                targetTransactionId = latestTransaction?.id ?? null;
            }

            let updatedTransactions = 0;
            if (targetTransactionId) {
                const updateResult = await tx.transaction.updateMany({
                    where: {
                        id: targetTransactionId,
                        bookingId: booking.id,
                    },
                    data: {
                        paymentId: payment.id,
                        grossAmount: String(grossAmount),
                        platformFeeAmount: String(platformFeeAmount),
                        netAmount: String(netAmount),
                        currency: booking.currency.toUpperCase(),
                        status: 'SUCCEEDED',
                        providerReference: paymentIntentId ?? session.id,
                        paidAt,
                    },
                });
                updatedTransactions = updateResult.count;
            }

            if (updatedTransactions === 0) {
                await tx.transaction.create({
                    data: {
                        organizationId: booking.organizationId,
                        businessId: booking.businessId,
                        bookingId: booking.id,
                        promotionId: booking.promotionId,
                        buyerUserId: booking.userId,
                        paymentId: payment.id,
                        grossAmount: String(grossAmount),
                        platformFeeAmount: String(platformFeeAmount),
                        netAmount: String(netAmount),
                        currency: booking.currency.toUpperCase(),
                        status: 'SUCCEEDED',
                        providerReference: paymentIntentId ?? session.id,
                        paidAt,
                    },
                });
            }

            if (booking.status === 'PENDING') {
                await tx.booking.update({
                    where: { id: booking.id },
                    data: { status: 'CONFIRMED' },
                });
            }
        });
    }

    private async processBookingPaymentExpired(session: Stripe.Checkout.Session) {
        const paymentId = session.metadata?.paymentId;
        const transactionId = session.metadata?.transactionId ?? null;
        if (!paymentId) {
            return;
        }

        await this.prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                select: {
                    metadata: true,
                },
            });

            await tx.payment.updateMany({
                where: {
                    id: paymentId,
                    status: 'PENDING',
                },
                data: {
                    status: 'CANCELED',
                    failureReason: 'Sesion de pago expirada',
                    metadata: mergeJsonObject(payment?.metadata, {
                        paymentType: 'BOOKING_PAYMENT',
                        checkoutSessionId: session.id,
                    }),
                },
            });

            if (transactionId) {
                await tx.transaction.updateMany({
                    where: {
                        id: transactionId,
                        paymentId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'CANCELED',
                    },
                });
            }
        });
    }

    private async processPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
        if (paymentIntent.metadata?.paymentType !== 'BOOKING_PAYMENT') {
            return;
        }

        const paymentIdFromMetadata = paymentIntent.metadata?.paymentId;
        let paymentId: string | null = paymentIdFromMetadata ?? null;
        if (!paymentId) {
            const existing = await this.prisma.payment.findUnique({
                where: {
                    providerPaymentIntentId: paymentIntent.id,
                },
                select: {
                    id: true,
                },
            });
            paymentId = existing?.id ?? null;
        }

        if (!paymentId) {
            return;
        }

        const failureReason = paymentIntent.last_payment_error?.message?.slice(0, 255) ?? 'Pago fallido';
        const transactionId = paymentIntent.metadata?.transactionId ?? null;

        await this.prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                select: {
                    id: true,
                    status: true,
                    metadata: true,
                },
            });

            if (!payment || payment.status !== 'PENDING') {
                return;
            }

            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    providerPaymentIntentId: paymentIntent.id,
                    status: 'FAILED',
                    failureReason,
                    metadata: mergeJsonObject(payment.metadata, {
                        paymentType: 'BOOKING_PAYMENT',
                        paymentIntentId: paymentIntent.id,
                    }),
                },
            });

            if (transactionId) {
                await tx.transaction.updateMany({
                    where: {
                        id: transactionId,
                        paymentId: payment.id,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'FAILED',
                    },
                });
            }
        });
    }

    private async processSubscriptionChanged(stripeSubscription: Stripe.Subscription) {
        await this.plansService.syncDefaultPlans();

        let organizationId: string | null = stripeSubscription.metadata?.organizationId ?? null;
        const providerSubscriptionId = stripeSubscription.id;
        const planCode = resolvePlanCode(stripeSubscription.metadata?.planCode);

        if (!organizationId) {
            const existing = await this.prisma.subscription.findUnique({
                where: { providerSubscriptionId },
                select: { organizationId: true },
            });
            organizationId = existing?.organizationId ?? null;
        }

        if (!organizationId) {
            return;
        }

        const baseSubscription = await this.subscriptionsService.ensureSubscriptionForOrganization(organizationId);
        const selectedPlan = planCode
            ? await this.prisma.plan.findUnique({ where: { code: planCode } })
            : await this.prisma.plan.findUnique({ where: { id: baseSubscription.planId } });

        if (!selectedPlan) {
            return;
        }

        const mappedStatus = mapStripeStatus(stripeSubscription.status);
        await this.prisma.subscription.upsert({
            where: { organizationId },
            update: {
                planId: selectedPlan.id,
                status: mappedStatus,
                providerSubscriptionId,
                providerCustomerId: resolveStringId(stripeSubscription.customer),
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
                canceledAt: stripeSubscription.canceled_at
                    ? new Date(stripeSubscription.canceled_at * 1000)
                    : null,
            },
            create: {
                organizationId,
                planId: selectedPlan.id,
                status: mappedStatus,
                providerSubscriptionId,
                providerCustomerId: resolveStringId(stripeSubscription.customer),
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
                canceledAt: stripeSubscription.canceled_at
                    ? new Date(stripeSubscription.canceled_at * 1000)
                    : null,
                currentPeriodStart: new Date(),
            },
        });

        await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                plan: selectedPlan.code,
                subscriptionStatus: mapSubscriptionToOrganizationStatus(mappedStatus),
            },
        });
    }

    private async processInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
        const providerSubscriptionId = this.extractInvoiceSubscriptionId(invoice);
        if (!providerSubscriptionId) {
            return;
        }

        const subscription = await this.prisma.subscription.findUnique({
            where: { providerSubscriptionId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!subscription) {
            return;
        }

        const amountPaid = (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100;
        const paymentIntentId = this.extractInvoicePaymentIntentId(invoice);
        const paymentData = {
            provider: 'stripe',
            amount: String(amountPaid),
            currency: (invoice.currency ?? 'dop').toUpperCase(),
            status: 'SUCCEEDED' as const,
            paidAt: new Date(),
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
            metadata: asJson(invoice),
            providerPaymentIntentId: paymentIntentId,
        };

        await this.prisma.payment.create({
            data: paymentData,
        });

        await this.upsertInvoiceFromStripe(subscription.organizationId, subscription.id, invoice, 'PAID');

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE' },
        });

        await this.prisma.organization.update({
            where: { id: subscription.organizationId },
            data: { subscriptionStatus: 'ACTIVE' },
        });
    }

    private async processInvoicePaymentFailed(invoice: Stripe.Invoice) {
        const providerSubscriptionId = this.extractInvoiceSubscriptionId(invoice);
        if (!providerSubscriptionId) {
            return;
        }

        const subscription = await this.prisma.subscription.findUnique({
            where: { providerSubscriptionId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!subscription) {
            return;
        }

        const amountDue = (invoice.amount_due ?? 0) / 100;
        const paymentIntentId = this.extractInvoicePaymentIntentId(invoice);

        await this.prisma.payment.create({
            data: {
                provider: 'stripe',
                amount: String(amountDue),
                currency: (invoice.currency ?? 'dop').toUpperCase(),
                status: 'FAILED',
                failureReason: invoice.last_finalization_error?.message ?? 'Pago fallido',
                organizationId: subscription.organizationId,
                subscriptionId: subscription.id,
                metadata: asJson(invoice),
                providerPaymentIntentId: paymentIntentId,
            },
        });

        await this.upsertInvoiceFromStripe(subscription.organizationId, subscription.id, invoice, 'OPEN');

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'PAST_DUE' },
        });

        await this.prisma.organization.update({
            where: { id: subscription.organizationId },
            data: { subscriptionStatus: 'PAST_DUE' },
        });
    }

    private async upsertInvoiceFromStripe(
        organizationId: string,
        subscriptionId: string,
        invoice: Stripe.Invoice,
        status: 'OPEN' | 'PAID',
    ) {
        const amountSubtotal = (invoice.subtotal ?? 0) / 100;
        const amountTotal = (invoice.total ?? 0) / 100;
        const amountTax = Math.max(amountTotal - amountSubtotal, 0);
        const invoicePdf = (invoice as unknown as { invoice_pdf?: string | null }).invoice_pdf ?? null;

        await this.prisma.invoice.upsert({
            where: { providerInvoiceId: invoice.id },
            update: {
                amountSubtotal: String(amountSubtotal),
                amountTax: String(amountTax),
                amountTotal: String(amountTotal),
                currency: (invoice.currency ?? 'dop').toUpperCase(),
                status,
                paidAt: status === 'PAID' ? new Date() : null,
                dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
                pdfUrl: invoicePdf,
                metadata: asJson(invoice),
            },
            create: {
                organizationId,
                subscriptionId,
                providerInvoiceId: invoice.id,
                number: invoice.number ?? null,
                amountSubtotal: String(amountSubtotal),
                amountTax: String(amountTax),
                amountTotal: String(amountTotal),
                currency: (invoice.currency ?? 'dop').toUpperCase(),
                status,
                issuedAt: new Date(),
                dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
                paidAt: status === 'PAID' ? new Date() : null,
                pdfUrl: invoicePdf,
                metadata: asJson(invoice),
            },
        });
    }

    private extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
        const parent = invoice.parent;
        if (!parent || parent.type !== 'subscription_details') {
            return null;
        }

        const subscription = parent.subscription_details?.subscription;
        return resolveStringId(subscription);
    }

    private extractInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
        const candidate = (invoice as unknown as { payment_intent?: string | { id: string } }).payment_intent;
        return resolveStringId(candidate);
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

    private async resolveStripeEvent(signature: string | undefined, body: unknown): Promise<Stripe.Event> {
        const stripe = this.resolveStripeClient();
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
        const normalizedSignature = signature?.trim();
        const isProduction =
            (this.configService.get<string>('NODE_ENV') ?? '').trim().toLowerCase() === 'production';
        const rawBody = normalizeRawBody(body);

        if (isProduction && (!webhookSecret || !normalizedSignature)) {
            throw new BadRequestException('Webhook signature is required in production');
        }

        if (webhookSecret && normalizedSignature && rawBody) {
            try {
                return await this.circuitBreaker.execute('stripe', () =>
                    Promise.resolve(
                        stripe.webhooks.constructEvent(rawBody, normalizedSignature, webhookSecret),
                    ),
                );
            } catch {
                throw new BadRequestException('Firma de webhook invalida');
            }
        }

        if (typeof body === 'object' && body !== null && 'id' in body && 'type' in body) {
            return body as Stripe.Event;
        }

        if (!rawBody) {
            throw new BadRequestException('Payload de webhook invalido');
        }

        try {
            return JSON.parse(rawBody.toString('utf8')) as Stripe.Event;
        } catch {
            throw new BadRequestException('Payload de webhook invalido');
        }
    }

    private resolveStripeClient(): Stripe {
        const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY')?.trim();
        if (!stripeSecretKey) {
            throw new ServiceUnavailableException('Stripe no esta configurado en este entorno');
        }

        return new Stripe(stripeSecretKey);
    }
}
