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
    OrganizationPlan,
    OrganizationRole,
    OrganizationSubscriptionStatus,
    SubscriptionStatus,
} from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutSessionDto } from './dto/subscription.dto';

@Injectable()
export class SubscriptionsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(PlansService)
        private readonly plansService: PlansService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
    ) { }

    async getCurrent(organizationId: string) {
        const subscription = await this.ensureSubscriptionForOrganization(organizationId);
        return this.serializeSubscription(subscription);
    }

    async createCheckoutSession(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
        dto: CreateCheckoutSessionDto,
    ) {
        await this.assertCanManageBilling(organizationId, actorUserId, actorGlobalRole);

        const stripe = this.resolveStripeClient();
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

        const targetPlan = await this.plansService.findByCode(dto.planCode);
        if (!targetPlan || !targetPlan.active) {
            throw new NotFoundException('Plan no disponible');
        }

        const currentSubscription = await this.ensureSubscriptionForOrganization(organizationId);
        const normalizedCurrency = targetPlan.currency.trim().toLowerCase();
        const monthlyPrice = Number(targetPlan.priceMonthly.toString());
        if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
            throw new BadRequestException('El precio mensual del plan no es válido');
        }

        let customerId = currentSubscription.providerCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: organization.ownerUser.email,
                name: organization.ownerUser.name,
                metadata: {
                    organizationId,
                },
            });
            customerId = customer.id;
        }

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'subscription',
            success_url: dto.successUrl,
            cancel_url: dto.cancelUrl,
            customer: customerId,
            line_items: [
                {
                    price_data: {
                        currency: normalizedCurrency,
                        unit_amount: Math.round(monthlyPrice * 100),
                        recurring: {
                            interval: 'month',
                        },
                        product_data: {
                            name: `AquiTa.do ${targetPlan.name}`,
                            description: targetPlan.description ?? undefined,
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                organizationId,
                planCode: targetPlan.code,
            },
            subscription_data: {
                metadata: {
                    organizationId,
                    planCode: targetPlan.code,
                },
            },
        });

        await this.prisma.subscription.update({
            where: { id: currentSubscription.id },
            data: {
                providerCustomerId: customerId,
                planId: targetPlan.id,
            },
        });

        await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                plan: targetPlan.code,
            },
        });

        return {
            sessionId: checkoutSession.id,
            checkoutUrl: checkoutSession.url,
        };
    }

    async cancelAtPeriodEnd(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
    ) {
        await this.assertCanManageBilling(organizationId, actorUserId, actorGlobalRole);
        const stripe = this.resolveStripeClient();

        const subscription = await this.ensureSubscriptionForOrganization(organizationId);
        if (!subscription.providerSubscriptionId) {
            throw new BadRequestException(
                'La organización no tiene una suscripción Stripe activa',
            );
        }

        const updatedStripeSubscription = await stripe.subscriptions.update(
            subscription.providerSubscriptionId,
            { cancel_at_period_end: true },
        );

        const mappedStatus = this.mapStripeStatus(updatedStripeSubscription.status);
        const updatedSubscription = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                cancelAtPeriodEnd: true,
                status: mappedStatus,
            },
            include: {
                plan: true,
            },
        });

        await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                subscriptionStatus: this.mapSubscriptionToOrganizationStatus(mappedStatus),
                subscriptionRenewsAt: updatedSubscription.currentPeriodEnd,
            },
        });

        return this.serializeSubscription(updatedSubscription);
    }

    async ensureSubscriptionForOrganization(organizationId: string) {
        await this.plansService.syncDefaultPlans();

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                plan: true,
                subscriptionStatus: true,
                subscriptionRenewsAt: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        const existingSubscription = await this.prisma.subscription.findUnique({
            where: { organizationId },
            include: {
                plan: true,
            },
        });

        if (existingSubscription) {
            return existingSubscription;
        }

        const linkedPlan = await this.prisma.plan.findUnique({
            where: { code: organization.plan },
        });

        if (!linkedPlan) {
            throw new NotFoundException('No se encontró el plan asociado para la organización');
        }

        return this.prisma.subscription.create({
            data: {
                organizationId,
                planId: linkedPlan.id,
                status: this.mapOrganizationToSubscriptionStatus(organization.subscriptionStatus),
                currentPeriodStart: new Date(),
                currentPeriodEnd: organization.subscriptionRenewsAt ?? null,
                cancelAtPeriodEnd: false,
            },
            include: {
                plan: true,
            },
        });
    }

    private mapOrganizationToSubscriptionStatus(
        status: OrganizationSubscriptionStatus,
    ): SubscriptionStatus {
        switch (status) {
            case 'ACTIVE':
                return 'ACTIVE';
            case 'PAST_DUE':
                return 'PAST_DUE';
            case 'CANCELED':
                return 'CANCELED';
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

    private serializeSubscription(subscription: {
        id: string;
        organizationId: string;
        status: SubscriptionStatus;
        providerCustomerId: string | null;
        providerSubscriptionId: string | null;
        currentPeriodStart: Date | null;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
        canceledAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        plan: {
            id: string;
            code: OrganizationPlan;
            name: string;
            description: string | null;
            priceMonthly: unknown;
            currency: string;
            transactionFeeBps: number;
            maxBusinesses: number | null;
            maxMembers: number | null;
            maxImagesPerBusiness: number | null;
            maxPromotions: number | null;
            analyticsRetentionDays: number | null;
        };
    }) {
        return {
            ...subscription,
            plan: {
                ...subscription.plan,
                priceMonthly: subscription.plan.priceMonthly?.toString?.() ?? subscription.plan.priceMonthly,
            },
        };
    }

    private resolveStripeClient(): Stripe {
        const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY')?.trim();
        if (!stripeSecretKey) {
            throw new ServiceUnavailableException('Stripe no está configurado en este entorno');
        }

        return new Stripe(stripeSecretKey);
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
}
