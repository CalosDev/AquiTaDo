import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import {
    DiscountType,
    OrganizationRole,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreatePromotionDto,
    ListMyPromotionsQueryDto,
    ListPublicPromotionsQueryDto,
    PromotionLifecycleStatus,
    UpdatePromotionDto,
} from './dto/promotion.dto';
import { RedisService } from '../cache/redis.service';
import { hashedCacheKey } from '../cache/cache-key';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PromotionsService {
    private readonly logger = new Logger(PromotionsService.name);
    private static readonly PUBLIC_PROMOTIONS_CACHE_PREFIX = 'public:promotions:list';

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(NotificationsQueueService)
        private readonly notificationsQueueService: NotificationsQueueService,
    ) { }

    private readonly includeRelations = {
        business: {
            select: {
                id: true,
                name: true,
                slug: true,
                verified: true,
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

    async listPublic(query: ListPublicPromotionsQueryDto) {
        const cacheKey = hashedCacheKey(PromotionsService.PUBLIC_PROMOTIONS_CACHE_PREFIX, query);
        return this.redisService.rememberJson(cacheKey, 120, async () => {
            const page = query.page ?? 1;
            const limit = query.limit ?? 12;
            const skip = (page - 1) * limit;
            const now = new Date();

            const where: Prisma.PromotionWhereInput = {
                isActive: true,
                startsAt: { lte: now },
                endsAt: { gte: now },
                business: {
                    verified: true,
                },
            };

            if (query.businessId) {
                where.businessId = query.businessId;
            }

            if (query.flashOnly) {
                where.isFlashOffer = true;
            }

            if (query.search?.trim()) {
                const needle = query.search.trim();
                where.OR = [
                    { title: { contains: needle, mode: 'insensitive' } },
                    { description: { contains: needle, mode: 'insensitive' } },
                    { couponCode: { contains: needle, mode: 'insensitive' } },
                    { business: { name: { contains: needle, mode: 'insensitive' } } },
                ];
            }

            const [data, total] = await Promise.all([
                this.prisma.promotion.findMany({
                    where,
                    include: this.includeRelations,
                    orderBy: [{ isFlashOffer: 'desc' }, { createdAt: 'desc' }],
                    skip,
                    take: limit,
                }),
                this.prisma.promotion.count({ where }),
            ]);

            return {
                data,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        });
    }

    async listMine(organizationId: string, query: ListMyPromotionsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const now = new Date();

        const where: Prisma.PromotionWhereInput = { organizationId };
        const andFilters: Prisma.PromotionWhereInput[] = [];

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.flashOnly) {
            where.isFlashOffer = true;
        }

        if (query.search?.trim()) {
            const needle = query.search.trim();
            andFilters.push({
                OR: [
                    { title: { contains: needle, mode: 'insensitive' } },
                    { description: { contains: needle, mode: 'insensitive' } },
                    { couponCode: { contains: needle, mode: 'insensitive' } },
                ],
            });
        }

        switch (query.status) {
            case PromotionLifecycleStatus.ACTIVE:
                where.isActive = true;
                where.startsAt = { lte: now };
                where.endsAt = { gte: now };
                break;
            case PromotionLifecycleStatus.SCHEDULED:
                where.isActive = true;
                where.startsAt = { gt: now };
                break;
            case PromotionLifecycleStatus.EXPIRED:
                andFilters.push({
                    OR: [
                        { isActive: false },
                        { endsAt: { lt: now } },
                    ],
                });
                break;
            default:
                break;
        }

        if (andFilters.length > 0) {
            where.AND = andFilters;
        }

        const [data, total] = await Promise.all([
            this.prisma.promotion.findMany({
                where,
                include: this.includeRelations,
                orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }],
                skip,
                take: limit,
            }),
            this.prisma.promotion.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async create(
        organizationId: string,
        actorUserId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: CreatePromotionDto,
    ) {
        this.assertCanManagePromotions(actorGlobalRole, organizationRole);
        this.validateDiscount(dto.discountType, dto.discountValue);

        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        this.assertDateRange(startsAt, endsAt);

        const createdPromotion = await this.prisma.$transaction(async (tx) => {
            await this.assertActiveSubscription(tx, organizationId);
            await this.assertBusinessBelongsToOrganization(tx, dto.businessId, organizationId);
            await this.assertPromotionLimit(tx, organizationId);

            const normalizedTitle = dto.title.trim();
            const baseSlug = slugify(normalizedTitle, { lower: true, strict: true });
            if (!baseSlug) {
                throw new BadRequestException('No se pudo generar slug para la promoción');
            }

            const slug = await this.generateUniqueSlug(tx, baseSlug);

            try {
                return await tx.promotion.create({
                    data: {
                        organizationId,
                        businessId: dto.businessId,
                        createdByUserId: actorUserId,
                        title: normalizedTitle,
                        slug,
                        description: dto.description?.trim(),
                        discountType: dto.discountType,
                        discountValue: String(dto.discountValue),
                        couponCode: dto.couponCode?.trim().toUpperCase(),
                        startsAt,
                        endsAt,
                        maxRedemptions: dto.maxRedemptions,
                        isFlashOffer: dto.isFlashOffer ?? false,
                        isActive: dto.isActive ?? true,
                    },
                    include: this.includeRelations,
                });
            } catch (error) {
                this.handlePrismaError(error);
                throw error;
            }
        });

        if (createdPromotion.isFlashOffer && createdPromotion.isActive) {
            await this.notificationsQueueService.enqueuePromotionGeoAlert({
                organizationId: createdPromotion.organizationId,
                businessId: createdPromotion.businessId,
                promotionId: createdPromotion.id,
                title: createdPromotion.title,
                message: createdPromotion.description?.trim() || 'Nueva oferta disponible por tiempo limitado.',
            });
        }

        await this.invalidatePublicPromotionsCache();
        return createdPromotion;
    }

    async update(
        id: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: UpdatePromotionDto,
    ) {
        const existingPromotion = await this.prisma.promotion.findUnique({
            where: { id },
            select: {
                id: true,
                organizationId: true,
                businessId: true,
                title: true,
                discountType: true,
                discountValue: true,
                startsAt: true,
                endsAt: true,
            },
        });

        if (!existingPromotion) {
            throw new NotFoundException('Promoción no encontrada');
        }

        if (actorGlobalRole !== 'ADMIN' && existingPromotion.organizationId !== organizationId) {
            throw new NotFoundException('Promoción no encontrada');
        }

        this.assertCanManagePromotions(actorGlobalRole, organizationRole);

        const nextDiscountType = dto.discountType ?? existingPromotion.discountType;
        const nextDiscountValue = dto.discountValue ?? Number(existingPromotion.discountValue.toString());
        this.validateDiscount(nextDiscountType, nextDiscountValue);

        const startsAt = dto.startsAt ? new Date(dto.startsAt) : existingPromotion.startsAt;
        const endsAt = dto.endsAt ? new Date(dto.endsAt) : existingPromotion.endsAt;
        this.assertDateRange(startsAt, endsAt);

        if (dto.businessId) {
            await this.assertBusinessBelongsToOrganization(this.prisma, dto.businessId, existingPromotion.organizationId);
        }

        let slug: string | undefined;
        if (dto.title && dto.title.trim() !== existingPromotion.title) {
            const baseSlug = slugify(dto.title.trim(), { lower: true, strict: true });
            if (!baseSlug) {
                throw new BadRequestException('No se pudo generar slug para la promoción');
            }

            slug = await this.generateUniqueSlug(this.prisma, baseSlug, id);
        }

        try {
            const updatedPromotion = await this.prisma.promotion.update({
                where: { id },
                data: {
                    businessId: dto.businessId,
                    title: dto.title?.trim(),
                    slug,
                    description: dto.description?.trim(),
                    discountType: dto.discountType,
                    discountValue: dto.discountValue !== undefined ? String(dto.discountValue) : undefined,
                    couponCode: dto.couponCode?.trim().toUpperCase(),
                    startsAt: dto.startsAt ? startsAt : undefined,
                    endsAt: dto.endsAt ? endsAt : undefined,
                    maxRedemptions: dto.maxRedemptions,
                    isFlashOffer: dto.isFlashOffer,
                    isActive: dto.isActive,
                },
                include: this.includeRelations,
            });

            await this.invalidatePublicPromotionsCache();
            return updatedPromotion;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async delete(
        id: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
    ) {
        const promotion = await this.prisma.promotion.findUnique({
            where: { id },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!promotion) {
            throw new NotFoundException('Promoción no encontrada');
        }

        if (actorGlobalRole !== 'ADMIN' && promotion.organizationId !== organizationId) {
            throw new NotFoundException('Promoción no encontrada');
        }

        this.assertCanManagePromotions(actorGlobalRole, organizationRole);

        await this.prisma.promotion.delete({
            where: { id },
        });
        await this.invalidatePublicPromotionsCache();

        return { message: 'Promoción eliminada exitosamente' };
    }

    private assertCanManagePromotions(
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
    ) {
        if (actorGlobalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole) {
            throw new ForbiddenException('No tienes permisos sobre esta organización');
        }

        if (organizationRole === 'STAFF') {
            throw new ForbiddenException('El rol STAFF no puede gestionar promociones');
        }
    }

    private validateDiscount(discountType: DiscountType, discountValue: number): void {
        if (!Number.isFinite(discountValue) || discountValue <= 0) {
            throw new BadRequestException('El valor de descuento debe ser mayor que 0');
        }

        if (discountType === 'PERCENTAGE' && discountValue > 100) {
            throw new BadRequestException('El descuento porcentual no puede ser mayor a 100');
        }
    }

    private assertDateRange(startsAt: Date, endsAt: Date): void {
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
            throw new BadRequestException('Las fechas de la promoción no son válidas');
        }

        if (endsAt <= startsAt) {
            throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
        }
    }

    private async assertActiveSubscription(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
        const organization = await tx.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                subscriptionStatus: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        if (organization.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripción de la organización está cancelada');
        }
    }

    private async assertPromotionLimit(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
        const currentLimit = await this.resolvePromotionLimit(tx, organizationId);
        if (currentLimit === null) {
            return;
        }

        const activeCount = await tx.promotion.count({
            where: {
                organizationId,
                isActive: true,
                endsAt: {
                    gte: new Date(),
                },
            },
        });

        if (activeCount >= currentLimit) {
            throw new BadRequestException(
                'La organización alcanzó el límite de promociones activas de su plan',
            );
        }
    }

    private async resolvePromotionLimit(tx: Prisma.TransactionClient, organizationId: string): Promise<number | null> {
        const subscription = await tx.subscription.findUnique({
            where: { organizationId },
            include: {
                plan: {
                    select: {
                        maxPromotions: true,
                    },
                },
            },
        });

        if (subscription?.plan) {
            return subscription.plan.maxPromotions;
        }

        const organization = await tx.organization.findUnique({
            where: { id: organizationId },
            select: { plan: true },
        });

        if (!organization) {
            return null;
        }

        const fallbackPlan = await tx.plan.findUnique({
            where: { code: organization.plan },
            select: {
                maxPromotions: true,
            },
        });

        return fallbackPlan?.maxPromotions ?? null;
    }

    private async assertBusinessBelongsToOrganization(
        prismaClient: PrismaClientLike,
        businessId: string,
        organizationId: string,
    ): Promise<void> {
        const business = await prismaClient.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!business || business.organizationId !== organizationId) {
            throw new BadRequestException('El negocio no pertenece a la organización activa');
        }
    }

    private async generateUniqueSlug(
        prismaClient: PrismaClientLike,
        baseSlug: string,
        excludingPromotionId?: string,
    ): Promise<string> {
        let slug = baseSlug;
        let counter = 1;

        while (
            await prismaClient.promotion.findFirst({
                where: {
                    slug,
                    ...(excludingPromotionId
                        ? {
                            id: {
                                not: excludingPromotionId,
                            },
                        }
                        : {}),
                },
                select: { id: true },
            })
        ) {
            slug = `${baseSlug}-${counter}`;
            counter += 1;
        }

        return slug;
    }

    private async invalidatePublicPromotionsCache(): Promise<void> {
        try {
            await this.redisService.deleteByPrefix(`${PromotionsService.PUBLIC_PROMOTIONS_CACHE_PREFIX}:`);
        } catch (error) {
            this.logger.warn(
                `Failed to invalidate promotions cache (${error instanceof Error ? error.message : String(error)})`,
            );
        }
    }

    private handlePrismaError(error: unknown): void {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
            return;
        }

        if (error.code === 'P2002') {
            throw new ConflictException('Ya existe una promoción con ese slug o cupón');
        }

        if (error.code === 'P2003') {
            throw new BadRequestException('No se pudo procesar la promoción por referencias inválidas');
        }
    }
}
