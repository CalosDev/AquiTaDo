import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
    AdCampaignStatus,
    AdEventType,
    OrganizationRole,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    AdPlacementQueryDto,
    CreateAdCampaignDto,
    ListAdCampaignsQueryDto,
    TrackAdInteractionDto,
} from './dto/ads.dto';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AdsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    private readonly includeCampaign = {
        business: {
            select: {
                id: true,
                name: true,
                slug: true,
                verified: true,
                reputationScore: true,
                province: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                city: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        },
        targetProvince: {
            select: {
                id: true,
                name: true,
                slug: true,
            },
        },
        targetCategory: {
            select: {
                id: true,
                name: true,
                slug: true,
            },
        },
        createdByUser: {
            select: {
                id: true,
                name: true,
                email: true,
            },
        },
    };

    async createCampaign(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: CreateAdCampaignDto,
    ) {
        this.assertCanManageCampaigns(actorGlobalRole, organizationRole);
        this.validateCampaignFinancials(dto.dailyBudget, dto.totalBudget, dto.bidAmount);

        const startsAt = this.parseDate(dto.startsAt, 'Fecha de inicio inválida');
        const endsAt = this.parseDate(dto.endsAt, 'Fecha de fin inválida');
        if (endsAt <= startsAt) {
            throw new BadRequestException('La fecha final debe ser mayor que la fecha inicial');
        }

        return this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: dto.businessId },
                select: {
                    id: true,
                    organizationId: true,
                    verified: true,
                },
            });

            if (!business || business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado en la organización activa');
            }

            if (!business.verified) {
                throw new BadRequestException('El negocio debe estar verificado para pauta interna');
            }

            if (dto.targetProvinceId) {
                const province = await tx.province.findUnique({
                    where: { id: dto.targetProvinceId },
                    select: { id: true },
                });
                if (!province) {
                    throw new NotFoundException('Provincia objetivo no encontrada');
                }
            }

            if (dto.targetCategoryId) {
                const category = await tx.category.findUnique({
                    where: { id: dto.targetCategoryId },
                    select: { id: true },
                });
                if (!category) {
                    throw new NotFoundException('Categoría objetivo no encontrada');
                }
            }

            const status = dto.status ?? 'DRAFT';
            if (status === 'ACTIVE' && startsAt > endsAt) {
                throw new BadRequestException('Rango de fechas inválido para campaña activa');
            }

            return tx.adCampaign.create({
                data: {
                    organizationId,
                    businessId: dto.businessId,
                    createdByUserId: actorUserId,
                    name: dto.name.trim(),
                    status,
                    targetProvinceId: dto.targetProvinceId,
                    targetCategoryId: dto.targetCategoryId,
                    dailyBudget: String(dto.dailyBudget),
                    totalBudget: String(dto.totalBudget),
                    bidAmount: String(dto.bidAmount),
                    startsAt,
                    endsAt,
                },
                include: this.includeCampaign,
            });
        });
    }

    async listMyCampaigns(
        organizationId: string,
        query: ListAdCampaignsQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const where: Prisma.AdCampaignWhereInput = {
            organizationId,
        };

        if (query.status) {
            where.status = query.status;
        }

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        const [data, total] = await Promise.all([
            this.prisma.adCampaign.findMany({
                where,
                include: this.includeCampaign,
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                skip,
                take: limit,
            }),
            this.prisma.adCampaign.count({ where }),
        ]);

        return {
            data: data.map((campaign) => ({
                ...campaign,
                dailyBudget: Number(campaign.dailyBudget.toString()),
                totalBudget: Number(campaign.totalBudget.toString()),
                bidAmount: Number(campaign.bidAmount.toString()),
                spentAmount: Number(campaign.spentAmount.toString()),
                ctr: campaign.impressions > 0
                    ? Number(((campaign.clicks / campaign.impressions) * 100).toFixed(2))
                    : 0,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async updateCampaignStatus(
        campaignId: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        status: AdCampaignStatus,
    ) {
        this.assertCanManageCampaigns(actorGlobalRole, organizationRole);

        const campaign = await this.prisma.adCampaign.findUnique({
            where: { id: campaignId },
            select: {
                id: true,
                organizationId: true,
                status: true,
                startsAt: true,
                endsAt: true,
                spentAmount: true,
                totalBudget: true,
                business: {
                    select: {
                        verified: true,
                    },
                },
            },
        });

        if (!campaign) {
            throw new NotFoundException('Campaña no encontrada');
        }

        if (actorGlobalRole !== 'ADMIN' && campaign.organizationId !== organizationId) {
            throw new NotFoundException('Campaña no encontrada');
        }

        if (status === 'ACTIVE') {
            if (!campaign.business.verified) {
                throw new BadRequestException('No se puede activar una campaña de negocio no verificado');
            }

            if (campaign.endsAt <= new Date()) {
                throw new BadRequestException('No se puede activar una campaña vencida');
            }

            if (campaign.spentAmount.gte(campaign.totalBudget)) {
                throw new BadRequestException('La campaña ya consumió su presupuesto total');
            }
        }

        return this.prisma.adCampaign.update({
            where: { id: campaignId },
            data: {
                status,
            },
            include: this.includeCampaign,
        });
    }

    async getPlacements(query: AdPlacementQueryDto) {
        const now = new Date();
        const take = Math.min(Math.max(query.limit ?? 6, 1), 30);

        const where: Prisma.AdCampaignWhereInput = {
            status: 'ACTIVE',
            startsAt: { lte: now },
            endsAt: { gte: now },
            business: {
                verified: true,
            },
            organization: {
                adWalletBalance: { gt: 0 },
            },
        };
        const andFilters: Prisma.AdCampaignWhereInput[] = [];

        if (query.provinceId) {
            andFilters.push({
                OR: [
                { targetProvinceId: null },
                { targetProvinceId: query.provinceId },
                ],
            });
        }

        if (query.categoryId) {
            andFilters.push({
                OR: [
                        { targetCategoryId: null },
                        { targetCategoryId: query.categoryId },
                ],
            });
        }

        if (andFilters.length > 0) {
            where.AND = andFilters;
        }

        const rows = await this.prisma.adCampaign.findMany({
            where,
            include: this.includeCampaign,
            orderBy: [
                { bidAmount: 'desc' },
                { business: { reputationScore: 'desc' } },
                { updatedAt: 'desc' },
            ],
            take: take * 3,
        });

        return rows
            .filter((campaign) => campaign.spentAmount.lt(campaign.totalBudget))
            .slice(0, take)
            .map((campaign, index) => {
            const ctr = campaign.impressions > 0
                ? Number(((campaign.clicks / campaign.impressions) * 100).toFixed(2))
                : 0;
            const bidAmount = Number(campaign.bidAmount.toString());
            const spentAmount = Number(campaign.spentAmount.toString());
            const totalBudget = Number(campaign.totalBudget.toString());
            const remainingBudget = Math.max(totalBudget - spentAmount, 0);
            const reputationScore = Number(campaign.business.reputationScore.toString());
            const adScore = Number((bidAmount * 0.7 + (reputationScore / 100) * 0.3).toFixed(4));

            return {
                placementRank: index + 1,
                adScore,
                campaign: {
                    id: campaign.id,
                    name: campaign.name,
                    bidAmount,
                    ctr,
                    remainingBudget: Number(remainingBudget.toFixed(2)),
                },
                business: campaign.business,
                targeting: {
                    province: campaign.targetProvince,
                    category: campaign.targetCategory,
                },
            };
            });
    }

    async trackImpression(
        campaignId: string,
        dto: TrackAdInteractionDto,
    ) {
        return this.trackCampaignInteraction(campaignId, dto, 'IMPRESSION');
    }

    async trackClick(
        campaignId: string,
        dto: TrackAdInteractionDto,
    ) {
        return this.trackCampaignInteraction(campaignId, dto, 'CLICK');
    }

    private async trackCampaignInteraction(
        campaignId: string,
        dto: TrackAdInteractionDto,
        eventType: AdEventType,
    ) {
        const now = new Date();
        const dateOnly = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        ));

        return this.prisma.$transaction(async (tx) => {
            const campaign = await tx.adCampaign.findUnique({
                where: { id: campaignId },
                select: {
                    id: true,
                    organizationId: true,
                    status: true,
                    startsAt: true,
                    endsAt: true,
                    bidAmount: true,
                    spentAmount: true,
                    totalBudget: true,
                    organization: {
                        select: {
                            adWalletBalance: true,
                        },
                    },
                    business: {
                        select: {
                            verified: true,
                        },
                    },
                },
            });

            if (!campaign) {
                throw new NotFoundException('Campaña no encontrada');
            }

            if (!this.isCampaignEligible(campaign, now)) {
                return {
                    tracked: false,
                    reason: 'CAMPAIGN_NOT_ELIGIBLE',
                };
            }

            const visitorHash = dto.visitorId?.trim()
                ? createHash('sha256').update(dto.visitorId.trim()).digest('hex').slice(0, 32)
                : null;

            if (visitorHash) {
                const unique = await this.registerUniqueEvent(
                    tx,
                    campaign.organizationId,
                    campaign.id,
                    eventType,
                    dateOnly,
                    visitorHash,
                );
                if (!unique) {
                    return {
                        tracked: false,
                        reason: 'DUPLICATED_VISITOR_EVENT',
                    };
                }
            }

            if (eventType === 'CLICK') {
                const walletBalance = Number(campaign.organization.adWalletBalance.toString());
                const bidAmount = Number(campaign.bidAmount.toString());
                if (walletBalance < bidAmount) {
                    await tx.adCampaign.update({
                        where: { id: campaign.id },
                        data: { status: 'PAUSED' },
                    });
                    return {
                        tracked: false,
                        reason: 'WALLET_INSUFFICIENT_FUNDS',
                    };
                }

                const nextSpent = Number(campaign.spentAmount.toString()) + Number(campaign.bidAmount.toString());
                const budgetLimit = Number(campaign.totalBudget.toString());
                if (nextSpent > budgetLimit) {
                    await tx.adCampaign.update({
                        where: { id: campaign.id },
                        data: { status: 'ENDED' },
                    });
                    return {
                        tracked: false,
                        reason: 'BUDGET_EXHAUSTED',
                    };
                }

                const debitedWallet = await tx.organization.updateMany({
                    where: {
                        id: campaign.organizationId,
                        adWalletBalance: { gte: campaign.bidAmount },
                    },
                    data: {
                        adWalletBalance: {
                            decrement: campaign.bidAmount,
                        },
                    },
                });

                if (debitedWallet.count !== 1) {
                    await tx.adCampaign.update({
                        where: { id: campaign.id },
                        data: { status: 'PAUSED' },
                    });
                    return {
                        tracked: false,
                        reason: 'WALLET_INSUFFICIENT_FUNDS',
                    };
                }

                const updated = await tx.adCampaign.update({
                    where: { id: campaign.id },
                    data: {
                        clicks: { increment: 1 },
                        spentAmount: { increment: campaign.bidAmount },
                        status: nextSpent >= budgetLimit ? 'ENDED' : campaign.status,
                    },
                    select: {
                        id: true,
                        status: true,
                        spentAmount: true,
                        totalBudget: true,
                        clicks: true,
                    },
                });

                await tx.adEvent.create({
                    data: {
                        campaignId: campaign.id,
                        eventType,
                        visitorHash,
                        costAmount: campaign.bidAmount,
                        metadata: dto.placementKey
                            ? ({
                                placementKey: dto.placementKey,
                            } as Prisma.InputJsonValue)
                            : undefined,
                    },
                });

                return {
                    tracked: true,
                    eventType,
                    campaignId: campaign.id,
                    status: updated.status,
                    chargedAmount: Number(campaign.bidAmount.toString()),
                    spentAmount: Number(updated.spentAmount.toString()),
                    remainingBudget: Number((
                        Number(updated.totalBudget.toString()) -
                        Number(updated.spentAmount.toString())
                    ).toFixed(2)),
                    clicks: updated.clicks,
                };
            }

            await tx.adCampaign.update({
                where: { id: campaign.id },
                data: {
                    impressions: { increment: 1 },
                },
            });

            await tx.adEvent.create({
                data: {
                    campaignId: campaign.id,
                    eventType,
                    visitorHash,
                    metadata: dto.placementKey
                        ? ({
                            placementKey: dto.placementKey,
                        } as Prisma.InputJsonValue)
                        : undefined,
                },
            });

            return {
                tracked: true,
                eventType,
                campaignId: campaign.id,
            };
        });
    }

    private isCampaignEligible(
        campaign: {
            status: AdCampaignStatus;
            startsAt: Date;
            endsAt: Date;
            business: { verified: boolean };
            spentAmount: Prisma.Decimal;
            totalBudget: Prisma.Decimal;
        },
        now: Date,
    ): boolean {
        if (!campaign.business.verified) {
            return false;
        }

        if (campaign.status !== 'ACTIVE') {
            return false;
        }

        if (campaign.startsAt > now || campaign.endsAt < now) {
            return false;
        }

        return campaign.spentAmount.lt(campaign.totalBudget);
    }

    private async registerUniqueEvent(
        tx: Prisma.TransactionClient,
        organizationId: string,
        campaignId: string,
        eventType: AdEventType,
        dateOnly: Date,
        visitorHash: string,
    ): Promise<boolean> {
        const periodStart = dateOnly;
        const periodEnd = new Date(dateOnly.getTime() + 86_400_000);
        const metricKey = `ad:${eventType}:${campaignId}:${visitorHash}`;

        try {
            await tx.usageMetric.create({
                data: {
                    organizationId,
                    metricKey,
                    metricValue: 1,
                    periodStart,
                    periodEnd,
                },
            });
            return true;
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                return false;
            }
            throw error;
        }
    }

    private assertCanManageCampaigns(
        globalRole: string,
        organizationRole: OrganizationRole | null,
    ): void {
        if (globalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole || organizationRole === 'STAFF') {
            throw new ForbiddenException('No tienes permisos para gestionar campañas');
        }
    }

    private validateCampaignFinancials(
        dailyBudget: number,
        totalBudget: number,
        bidAmount: number,
    ): void {
        if (dailyBudget > totalBudget) {
            throw new BadRequestException('El presupuesto diario no puede exceder el presupuesto total');
        }

        if (bidAmount > dailyBudget) {
            throw new BadRequestException('La puja por clic no puede exceder el presupuesto diario');
        }
    }

    private parseDate(value: string, message: string): Date {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(message);
        }
        return parsed;
    }
}
