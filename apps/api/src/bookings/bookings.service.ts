import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    BookingStatus,
    OrganizationRole,
    Prisma,
    Promotion,
    TransactionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';
import {
    CreateBookingDto,
    ListBookingsQueryDto,
    ListTransactionsQueryDto,
    UpdateBookingStatusDto,
} from './dto/booking.dto';

@Injectable()
export class BookingsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
        @Inject(NotificationsQueueService)
        private readonly notificationsQueueService: NotificationsQueueService,
    ) { }

    private readonly bookingInclude = {
        business: {
            select: {
                id: true,
                name: true,
                slug: true,
                verified: true,
            },
        },
        user: {
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
            },
        },
        promotion: {
            select: {
                id: true,
                title: true,
                couponCode: true,
                discountType: true,
                discountValue: true,
            },
        },
        transactions: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
        },
    };

    async createForUser(userId: string, dto: CreateBookingDto) {
        const scheduledFor = new Date(dto.scheduledFor);
        if (Number.isNaN(scheduledFor.getTime())) {
            throw new BadRequestException('La fecha de reserva no es válida');
        }

        if (scheduledFor <= new Date()) {
            throw new BadRequestException('La fecha de reserva debe ser futura');
        }

        if (
            dto.quotedAmount !== undefined &&
            dto.depositAmount !== undefined &&
            dto.depositAmount > dto.quotedAmount
        ) {
            throw new BadRequestException('El depósito no puede exceder el monto cotizado');
        }

        const business = await this.prisma.business.findUnique({
            where: { id: dto.businessId },
            select: {
                id: true,
                organizationId: true,
                verified: true,
            },
        });

        if (!business || !business.verified) {
            throw new NotFoundException('Negocio no disponible para reservas');
        }

        const booking = await this.prisma.$transaction(async (tx) => {
            const promotion = await this.resolveApplicablePromotion(
                tx,
                business.organizationId,
                business.id,
                dto.promotionId,
                dto.couponCode,
            );

            const booking = await tx.booking.create({
                data: {
                    organizationId: business.organizationId,
                    businessId: business.id,
                    userId,
                    promotionId: promotion?.id ?? null,
                    status: 'PENDING',
                    source: 'PLATFORM',
                    scheduledFor,
                    partySize: dto.partySize,
                    notes: dto.notes?.trim(),
                    quotedAmount: dto.quotedAmount !== undefined ? String(dto.quotedAmount) : null,
                    depositAmount: dto.depositAmount !== undefined ? String(dto.depositAmount) : null,
                    currency: dto.currency?.trim().toUpperCase() ?? 'DOP',
                },
                include: this.bookingInclude,
            });

            if (promotion) {
                await tx.promotion.update({
                    where: { id: promotion.id },
                    data: {
                        redemptionsCount: {
                            increment: 1,
                        },
                    },
                });
            }

            return booking;
        });

        const scheduledForDate = new Date(booking.scheduledFor);
        if (!Number.isNaN(scheduledForDate.getTime())) {
            const reminderAt = new Date(scheduledForDate.getTime() - 2 * 60 * 60 * 1000);
            await this.notificationsQueueService.enqueueBookingReminder(
                {
                    organizationId: booking.organizationId,
                    businessId: booking.businessId,
                    bookingId: booking.id,
                    businessName: booking.business.name,
                    customerPhone: booking.user?.phone ?? null,
                    scheduledFor: scheduledForDate.toISOString(),
                },
                reminderAt,
            );
        }

        return booking;
    }

    async listMyBookings(userId: string, query: ListBookingsQueryDto) {
        return this.listBookings(
            {
                userId,
            },
            query,
        );
    }

    async listOrganizationBookings(organizationId: string, query: ListBookingsQueryDto) {
        return this.listBookings(
            {
                organizationId,
            },
            query,
        );
    }

    async updateStatus(
        bookingId: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: UpdateBookingStatusDto,
    ) {
        this.assertCanManageBooking(actorGlobalRole, organizationRole);

        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            select: {
                id: true,
                organizationId: true,
                businessId: true,
                userId: true,
                promotionId: true,
                currency: true,
                quotedAmount: true,
            },
        });

        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }

        if (actorGlobalRole !== 'ADMIN' && booking.organizationId !== organizationId) {
            throw new NotFoundException('Reserva no encontrada');
        }

        const quotedAmount =
            dto.quotedAmount !== undefined
                ? dto.quotedAmount
                : booking.quotedAmount
                    ? Number(booking.quotedAmount.toString())
                    : undefined;

        if (
            quotedAmount !== undefined &&
            dto.depositAmount !== undefined &&
            dto.depositAmount > quotedAmount
        ) {
            throw new BadRequestException('El depósito no puede exceder el monto cotizado');
        }

        return this.prisma.$transaction(async (tx) => {
            const updatedBooking = await tx.booking.update({
                where: { id: bookingId },
                data: {
                    status: dto.status,
                    quotedAmount: dto.quotedAmount !== undefined ? String(dto.quotedAmount) : undefined,
                    depositAmount: dto.depositAmount !== undefined ? String(dto.depositAmount) : undefined,
                    notes: dto.notes?.trim(),
                },
                include: this.bookingInclude,
            });

            const effectiveQuotedAmount =
                dto.quotedAmount !== undefined
                    ? dto.quotedAmount
                    : updatedBooking.quotedAmount
                        ? Number(updatedBooking.quotedAmount.toString())
                        : 0;

            if (
                (dto.status === 'CONFIRMED' || dto.status === 'COMPLETED') &&
                effectiveQuotedAmount > 0
            ) {
                await this.upsertBookingTransaction(tx, {
                    bookingId: updatedBooking.id,
                    organizationId: updatedBooking.organizationId,
                    businessId: updatedBooking.businessId,
                    promotionId: updatedBooking.promotionId,
                    userId: updatedBooking.userId,
                    currency: updatedBooking.currency,
                    grossAmount: effectiveQuotedAmount,
                    status: dto.status === 'COMPLETED' ? 'SUCCEEDED' : 'PENDING',
                });
            }

            if (dto.status === 'CANCELED') {
                await tx.transaction.updateMany({
                    where: {
                        bookingId: updatedBooking.id,
                        status: {
                            in: ['PENDING'],
                        },
                    },
                    data: {
                        status: 'CANCELED',
                    },
                });
            }

            if (dto.status === 'COMPLETED') {
                await this.reputationService.recalculateBusinessReputation(
                    updatedBooking.businessId,
                    tx,
                );
            }

            return updatedBooking;
        });
    }

    async listOrganizationTransactions(organizationId: string, query: ListTransactionsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.TransactionWhereInput = {
            organizationId,
        };

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.status) {
            where.status = query.status;
        }

        const [data, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where,
                include: {
                    booking: {
                        select: {
                            id: true,
                            scheduledFor: true,
                            status: true,
                        },
                    },
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    buyerUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.transaction.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    private async listBookings(baseWhere: Prisma.BookingWhereInput, query: ListBookingsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.BookingWhereInput = {
            ...baseWhere,
        };

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.status) {
            where.status = query.status;
        }

        if (query.from || query.to) {
            where.scheduledFor = {
                gte: query.from ? new Date(query.from) : undefined,
                lte: query.to ? new Date(query.to) : undefined,
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.booking.findMany({
                where,
                include: this.bookingInclude,
                orderBy: { scheduledFor: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.booking.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    private assertCanManageBooking(
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
    ): void {
        if (actorGlobalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole) {
            throw new ForbiddenException('No tienes permisos para gestionar reservas');
        }

        if (organizationRole === 'STAFF') {
            throw new ForbiddenException('El rol STAFF no puede actualizar reservas');
        }
    }

    private async resolveApplicablePromotion(
        tx: Prisma.TransactionClient,
        organizationId: string,
        businessId: string,
        promotionId?: string,
        couponCode?: string,
    ): Promise<Promotion | null> {
        if (!promotionId && !couponCode) {
            return null;
        }

        if (promotionId && couponCode) {
            throw new BadRequestException('Usa promotionId o couponCode, pero no ambos');
        }

        const now = new Date();
        let promotion: Promotion | null = null;

        if (promotionId) {
            promotion = await tx.promotion.findUnique({
                where: { id: promotionId },
            });
        } else if (couponCode) {
            promotion = await tx.promotion.findFirst({
                where: {
                    businessId,
                    couponCode: couponCode.trim().toUpperCase(),
                },
            });
        }

        if (!promotion) {
            throw new BadRequestException('Promoción no encontrada');
        }

        if (
            promotion.organizationId !== organizationId ||
            promotion.businessId !== businessId
        ) {
            throw new BadRequestException('La promoción no aplica para este negocio');
        }

        if (!promotion.isActive || promotion.startsAt > now || promotion.endsAt < now) {
            throw new BadRequestException('La promoción no está activa');
        }

        if (
            promotion.maxRedemptions !== null &&
            promotion.redemptionsCount >= promotion.maxRedemptions
        ) {
            throw new BadRequestException('La promoción alcanzó su límite de redenciones');
        }

        return promotion;
    }

    private async upsertBookingTransaction(
        tx: Prisma.TransactionClient,
        payload: {
            bookingId: string;
            organizationId: string;
            businessId: string;
            promotionId: string | null;
            userId: string | null;
            currency: string;
            grossAmount: number;
            status: TransactionStatus;
        },
    ): Promise<void> {
        const feeBps = await this.resolveTransactionFeeBps(tx, payload.organizationId);
        const platformFeeAmount = this.roundMoney((payload.grossAmount * feeBps) / 10_000);
        const netAmount = this.roundMoney(payload.grossAmount - platformFeeAmount);

        const existing = await tx.transaction.findFirst({
            where: { bookingId: payload.bookingId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        if (existing) {
            await tx.transaction.update({
                where: { id: existing.id },
                data: {
                    grossAmount: String(payload.grossAmount),
                    platformFeeAmount: String(platformFeeAmount),
                    netAmount: String(netAmount),
                    status: payload.status,
                    paidAt: payload.status === 'SUCCEEDED' ? new Date() : null,
                },
            });
            return;
        }

        await tx.transaction.create({
            data: {
                organizationId: payload.organizationId,
                businessId: payload.businessId,
                bookingId: payload.bookingId,
                promotionId: payload.promotionId,
                buyerUserId: payload.userId,
                grossAmount: String(payload.grossAmount),
                platformFeeAmount: String(platformFeeAmount),
                netAmount: String(netAmount),
                currency: payload.currency.toUpperCase(),
                status: payload.status,
                paidAt: payload.status === 'SUCCEEDED' ? new Date() : null,
            },
        });
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

    private roundMoney(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
