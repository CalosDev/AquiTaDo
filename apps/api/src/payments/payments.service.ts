import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
    OrganizationPlan,
    OrganizationSubscriptionStatus,
    Prisma,
    SubscriptionStatus,
} from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

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
}
