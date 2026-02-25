import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
    OrganizationRole,
    OrganizationPlan,
    OrganizationSubscriptionStatus,
    Prisma,
    SubscriptionStatus,
} from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateAdsWalletCheckoutSessionDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(PlansService)
        private readonly plansService: PlansService,
        @Inject(SubscriptionsService)
        private readonly subscriptionsService: SubscriptionsService,
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
            const customer = await stripe.customers.create({
                email: organization.ownerUser.email,
                name: organization.ownerUser.name,
                metadata: {
                    organizationId,
                },
            });
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
            const checkoutSession = await stripe.checkout.sessions.create({
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
            });

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

    async getBillingSummary(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = this.resolveDateRange(from, to);
        const createdAtRange = this.resolveDateRange(from, to);

        const invoiceWhere: Prisma.InvoiceWhereInput = {
            organizationId,
            ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
        };
        const paymentWhere: Prisma.PaymentWhereInput = {
            organizationId,
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
        };
        const transactionWhere: Prisma.TransactionWhereInput = {
            organizationId,
            status: 'SUCCEEDED',
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
        };

        const [invoiceStatusStats, paymentStatusStats, transactionSummary] = await Promise.all([
            this.prisma.invoice.groupBy({
                by: ['status'],
                where: invoiceWhere,
                _count: { _all: true },
                _sum: {
                    amountSubtotal: true,
                    amountTax: true,
                    amountTotal: true,
                },
            }),
            this.prisma.payment.groupBy({
                by: ['status'],
                where: paymentWhere,
                _count: { _all: true },
                _sum: {
                    amount: true,
                },
            }),
            this.prisma.transaction.aggregate({
                where: transactionWhere,
                _count: { _all: true },
                _sum: {
                    grossAmount: true,
                    platformFeeAmount: true,
                    netAmount: true,
                },
            }),
        ]);

        const invoiceByStatus: Record<string, { count: number; total: number }> = {};
        for (const row of invoiceStatusStats) {
            invoiceByStatus[row.status] = {
                count: row._count._all,
                total: Number(row._sum.amountTotal?.toString() ?? '0'),
            };
        }

        const paymentByStatus: Record<string, { count: number; total: number }> = {};
        for (const row of paymentStatusStats) {
            paymentByStatus[row.status] = {
                count: row._count._all,
                total: Number(row._sum.amount?.toString() ?? '0'),
            };
        }

        return {
            range: { from: from ?? null, to: to ?? null },
            invoices: {
                byStatus: invoiceByStatus,
                subtotal: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountSubtotal?.toString() ?? '0'),
                    0,
                ),
                tax: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountTax?.toString() ?? '0'),
                    0,
                ),
                total: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountTotal?.toString() ?? '0'),
                    0,
                ),
            },
            payments: {
                byStatus: paymentByStatus,
                totalCollected: paymentByStatus.SUCCEEDED?.total ?? 0,
                totalFailed: paymentByStatus.FAILED?.total ?? 0,
            },
            marketplace: {
                successfulTransactions: transactionSummary._count._all,
                grossAmount: Number(transactionSummary._sum.grossAmount?.toString() ?? '0'),
                platformFeeAmount: Number(transactionSummary._sum.platformFeeAmount?.toString() ?? '0'),
                netAmount: Number(transactionSummary._sum.netAmount?.toString() ?? '0'),
            },
        };
    }

    async exportInvoicesCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = this.resolveDateRange(from, to);
        const invoices = await this.prisma.invoice.findMany({
            where: {
                organizationId,
                ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
            },
            orderBy: { issuedAt: 'desc' },
        });

        const headers = [
            'invoice_id',
            'number',
            'status',
            'issued_at',
            'due_at',
            'paid_at',
            'currency',
            'subtotal',
            'tax',
            'total',
            'pdf_url',
        ];

        const rows = invoices.map((invoice) => [
            invoice.id,
            invoice.number ?? '',
            invoice.status,
            invoice.issuedAt.toISOString(),
            invoice.dueAt?.toISOString() ?? '',
            invoice.paidAt?.toISOString() ?? '',
            invoice.currency,
            invoice.amountSubtotal.toString(),
            invoice.amountTax.toString(),
            invoice.amountTotal.toString(),
            invoice.pdfUrl ?? '',
        ]);

        const csv = this.toCsv(headers, rows);
        const fileName = `invoices_${organizationId}_${new Date().toISOString().slice(0, 10)}.csv`;

        return { fileName, csv };
    }

    async exportPaymentsCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const createdAtRange = this.resolveDateRange(from, to);
        const payments = await this.prisma.payment.findMany({
            where: {
                organizationId,
                ...(createdAtRange ? { createdAt: createdAtRange } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });

        const headers = [
            'payment_id',
            'provider',
            'provider_payment_intent_id',
            'status',
            'amount',
            'currency',
            'created_at',
            'paid_at',
            'failure_reason',
        ];

        const rows = payments.map((payment) => [
            payment.id,
            payment.provider,
            payment.providerPaymentIntentId ?? '',
            payment.status,
            payment.amount.toString(),
            payment.currency,
            payment.createdAt.toISOString(),
            payment.paidAt?.toISOString() ?? '',
            payment.failureReason ?? '',
        ]);

        const csv = this.toCsv(headers, rows);
        const fileName = `payments_${organizationId}_${new Date().toISOString().slice(0, 10)}.csv`;

        return { fileName, csv };
    }

    async handleStripeWebhook(signature: string | undefined, body: unknown) {
        const event = this.resolveStripeEvent(signature, body);

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
                payload: this.asJson(event),
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
            default:
                this.logger.debug(`stripe.webhook.ignored type=${event.type}`);
        }
    }

    private async processCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
        if (session.metadata?.paymentType === 'AD_WALLET_TOPUP') {
            await this.processAdWalletTopupCompleted(session);
            return;
        }

        const organizationId = session.metadata?.organizationId;
        if (!organizationId) {
            return;
        }

        await this.plansService.syncDefaultPlans();
        const selectedPlanCode = this.resolvePlanCode(session.metadata?.planCode);
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
                metadata: this.asJson(session),
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

        const paymentIntentId = this.resolveStringId(session.payment_intent);
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
                    metadata: this.asJson(session),
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

    private async processSubscriptionChanged(stripeSubscription: Stripe.Subscription) {
        await this.plansService.syncDefaultPlans();

        let organizationId: string | null = stripeSubscription.metadata?.organizationId ?? null;
        const providerSubscriptionId = stripeSubscription.id;
        const planCode = this.resolvePlanCode(stripeSubscription.metadata?.planCode);

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

        const mappedStatus = this.mapStripeStatus(stripeSubscription.status);
        await this.prisma.subscription.upsert({
            where: { organizationId },
            update: {
                planId: selectedPlan.id,
                status: mappedStatus,
                providerSubscriptionId,
                providerCustomerId: this.resolveStringId(stripeSubscription.customer),
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
                providerCustomerId: this.resolveStringId(stripeSubscription.customer),
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
                subscriptionStatus: this.mapSubscriptionToOrganizationStatus(mappedStatus),
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
            metadata: this.asJson(invoice),
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
                metadata: this.asJson(invoice),
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
                metadata: this.asJson(invoice),
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
                metadata: this.asJson(invoice),
            },
        });
    }

    private extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
        const parent = invoice.parent;
        if (!parent || parent.type !== 'subscription_details') {
            return null;
        }

        const subscription = parent.subscription_details?.subscription;
        return this.resolveStringId(subscription);
    }

    private extractInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
        const candidate = (invoice as unknown as { payment_intent?: string | { id: string } }).payment_intent;
        return this.resolveStringId(candidate);
    }

    private resolveStringId(value: unknown): string | null {
        if (typeof value === 'string') {
            return value;
        }

        if (value && typeof value === 'object' && 'id' in value) {
            const id = (value as { id?: unknown }).id;
            return typeof id === 'string' ? id : null;
        }

        return null;
    }

    private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
        switch (status) {
            case 'active':
            case 'trialing':
                return 'ACTIVE';
            case 'past_due':
                return 'PAST_DUE';
            case 'canceled':
                return 'CANCELED';
            case 'incomplete':
            case 'incomplete_expired':
                return 'INCOMPLETE';
            case 'unpaid':
                return 'UNPAID';
            default:
                return 'ACTIVE';
        }
    }

    private mapSubscriptionToOrganizationStatus(
        status: SubscriptionStatus,
    ): OrganizationSubscriptionStatus {
        switch (status) {
            case 'PAST_DUE':
                return 'PAST_DUE';
            case 'CANCELED':
                return 'CANCELED';
            default:
                return 'ACTIVE';
        }
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
            throw new ForbiddenException('No tienes acceso a esta organización');
        }

        if (membership.role !== OrganizationRole.OWNER) {
            throw new ForbiddenException('Solo el owner puede gestionar la facturación');
        }
    }

    private resolveStripeEvent(signature: string | undefined, body: unknown): Stripe.Event {
        const stripe = this.resolveStripeClient();
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
        const rawBody = this.normalizeRawBody(body);

        if (webhookSecret && signature && rawBody) {
            try {
                return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
            } catch {
                throw new BadRequestException('Firma de webhook inválida');
            }
        }

        if (typeof body === 'object' && body !== null && 'id' in body && 'type' in body) {
            return body as Stripe.Event;
        }

        if (!rawBody) {
            throw new BadRequestException('Payload de webhook inválido');
        }

        try {
            return JSON.parse(rawBody.toString('utf8')) as Stripe.Event;
        } catch {
            throw new BadRequestException('Payload de webhook inválido');
        }
    }

    private normalizeRawBody(body: unknown): Buffer | null {
        if (Buffer.isBuffer(body)) {
            return body;
        }

        if (typeof body === 'string') {
            return Buffer.from(body);
        }

        if (body && typeof body === 'object') {
            try {
                return Buffer.from(JSON.stringify(body));
            } catch {
                return null;
            }
        }

        return null;
    }

    private resolvePlanCode(value: string | undefined): OrganizationPlan | null {
        if (!value) {
            return null;
        }

        if (value === 'FREE' || value === 'GROWTH' || value === 'SCALE') {
            return value;
        }

        return null;
    }

    private resolveStripeClient(): Stripe {
        const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY')?.trim();
        if (!stripeSecretKey) {
            throw new ServiceUnavailableException('Stripe no está configurado en este entorno');
        }

        return new Stripe(stripeSecretKey);
    }

    private asJson(payload: unknown): Prisma.InputJsonValue {
        return payload as Prisma.InputJsonValue;
    }

    private resolveDateRange(
        from?: string,
        to?: string,
    ): Prisma.DateTimeFilter | null {
        if (!from && !to) {
            return null;
        }

        const range: Prisma.DateTimeFilter = {};
        if (from) {
            const parsedFrom = new Date(from);
            if (Number.isNaN(parsedFrom.getTime())) {
                throw new BadRequestException('Fecha inicial inválida');
            }
            range.gte = parsedFrom;
        }

        if (to) {
            const parsedTo = new Date(to);
            if (Number.isNaN(parsedTo.getTime())) {
                throw new BadRequestException('Fecha final inválida');
            }
            range.lte = parsedTo;
        }

        return range;
    }

    private toCsv(headers: string[], rows: Array<Array<string>>): string {
        const serializedHeaders = headers.map((header) => this.escapeCsv(header)).join(',');
        const serializedRows = rows.map((row) => row.map((cell) => this.escapeCsv(cell)).join(','));
        return [serializedHeaders, ...serializedRows].join('\n');
    }

    private escapeCsv(value: string): string {
        if (!value.includes(',') && !value.includes('"') && !value.includes('\n')) {
            return value;
        }

        return `"${value.replace(/"/g, '""')}"`;
    }
}
