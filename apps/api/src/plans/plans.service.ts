import { Inject, Injectable } from '@nestjs/common';
import { OrganizationPlan } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PLANS: Array<{
    code: OrganizationPlan;
    name: string;
    description: string;
    priceMonthly: string;
    currency: string;
    transactionFeeBps: number;
    maxBusinesses: number | null;
    maxMembers: number | null;
    maxImagesPerBusiness: number | null;
    maxPromotions: number | null;
    analyticsRetentionDays: number | null;
}> = [
        {
            code: 'FREE',
            name: 'Free',
            description: 'Plan inicial para presencia digital básica',
            priceMonthly: '0',
            currency: 'DOP',
            transactionFeeBps: 1200,
            maxBusinesses: 1,
            maxMembers: 3,
            maxImagesPerBusiness: 10,
            maxPromotions: 1,
            analyticsRetentionDays: 30,
        },
        {
            code: 'GROWTH',
            name: 'Pro',
            description: 'Plan para negocios en crecimiento con mayor visibilidad',
            priceMonthly: '1990',
            currency: 'DOP',
            transactionFeeBps: 800,
            maxBusinesses: 5,
            maxMembers: 15,
            maxImagesPerBusiness: 50,
            maxPromotions: 10,
            analyticsRetentionDays: 365,
        },
        {
            code: 'SCALE',
            name: 'Premium',
            description: 'Plan avanzado con capacidad y soporte preferencial',
            priceMonthly: '4990',
            currency: 'DOP',
            transactionFeeBps: 500,
            maxBusinesses: null,
            maxMembers: null,
            maxImagesPerBusiness: null,
            maxPromotions: null,
            analyticsRetentionDays: null,
        },
    ];

@Injectable()
export class PlansService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async findPublicPlans() {
        await this.syncDefaultPlans();

        return this.prisma.plan.findMany({
            where: { active: true },
            select: {
                id: true,
                code: true,
                name: true,
                description: true,
                priceMonthly: true,
                currency: true,
                transactionFeeBps: true,
                maxBusinesses: true,
                maxMembers: true,
                maxImagesPerBusiness: true,
                maxPromotions: true,
                analyticsRetentionDays: true,
            },
            orderBy: { priceMonthly: 'asc' },
        });
    }

    async findByCode(code: OrganizationPlan) {
        await this.syncDefaultPlans();
        return this.prisma.plan.findUnique({
            where: { code },
        });
    }

    async syncDefaultPlans() {
        await Promise.all(
            DEFAULT_PLANS.map((plan) =>
                this.prisma.plan.upsert({
                    where: { code: plan.code },
                    update: {
                        name: plan.name,
                        description: plan.description,
                        priceMonthly: plan.priceMonthly,
                        currency: plan.currency,
                        transactionFeeBps: plan.transactionFeeBps,
                        maxBusinesses: plan.maxBusinesses,
                        maxMembers: plan.maxMembers,
                        maxImagesPerBusiness: plan.maxImagesPerBusiness,
                        maxPromotions: plan.maxPromotions,
                        analyticsRetentionDays: plan.analyticsRetentionDays,
                        active: true,
                    },
                    create: {
                        code: plan.code,
                        name: plan.name,
                        description: plan.description,
                        priceMonthly: plan.priceMonthly,
                        currency: plan.currency,
                        transactionFeeBps: plan.transactionFeeBps,
                        maxBusinesses: plan.maxBusinesses,
                        maxMembers: plan.maxMembers,
                        maxImagesPerBusiness: plan.maxImagesPerBusiness,
                        maxPromotions: plan.maxPromotions,
                        analyticsRetentionDays: plan.analyticsRetentionDays,
                        active: true,
                    },
                }),
            ),
        );
    }
}
