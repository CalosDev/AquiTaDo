import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesLeadStage } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateSalesLeadDto,
    ListCustomersQueryDto,
    ListSalesPipelineQueryDto,
    UpdateSalesLeadStageDto,
} from './dto/crm.dto';

type CustomerSegment = 'NUEVO' | 'FRECUENTE' | 'VIP';

@Injectable()
export class CrmService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async listCustomers(
        organizationId: string,
        query: ListCustomersQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const businessWhere = query.businessId ? { businessId: query.businessId } : {};

        const [bookingUsers, transactionUsers, conversationUsers] = await Promise.all([
            this.prisma.booking.findMany({
                where: {
                    organizationId,
                    userId: { not: null },
                    ...businessWhere,
                },
                select: { userId: true },
                distinct: ['userId'],
            }),
            this.prisma.transaction.findMany({
                where: {
                    organizationId,
                    buyerUserId: { not: null },
                    ...businessWhere,
                },
                select: { buyerUserId: true },
                distinct: ['buyerUserId'],
            }),
            this.prisma.conversation.findMany({
                where: {
                    organizationId,
                    ...businessWhere,
                },
                select: { customerUserId: true },
                distinct: ['customerUserId'],
            }),
        ]);

        const userIdsSet = new Set<string>();
        for (const row of bookingUsers) {
            if (row.userId) userIdsSet.add(row.userId);
        }
        for (const row of transactionUsers) {
            if (row.buyerUserId) userIdsSet.add(row.buyerUserId);
        }
        for (const row of conversationUsers) {
            userIdsSet.add(row.customerUserId);
        }

        const allUserIds = [...userIdsSet];
        if (allUserIds.length === 0) {
            return {
                data: [],
                total: 0,
                page,
                limit,
                totalPages: 0,
            };
        }

        const userWhere: Prisma.UserWhereInput = {
            id: { in: allUserIds },
        };

        if (query.search?.trim()) {
            const needle = query.search.trim();
            userWhere.OR = [
                { name: { contains: needle, mode: 'insensitive' } },
                { email: { contains: needle, mode: 'insensitive' } },
            ];
        }

        const [total, users] = await Promise.all([
            this.prisma.user.count({ where: userWhere }),
            this.prisma.user.findMany({
                where: userWhere,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    createdAt: true,
                },
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
        ]);

        const pageUserIds = users.map((user) => user.id);
        if (pageUserIds.length === 0) {
            return {
                data: [],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }

        const [bookingStatusStats, bookingOverallStats, transactionStats, conversationStats] = await Promise.all([
            this.prisma.booking.groupBy({
                by: ['userId', 'status'],
                where: {
                    organizationId,
                    userId: { in: pageUserIds },
                    ...businessWhere,
                },
                _count: { _all: true },
            }),
            this.prisma.booking.groupBy({
                by: ['userId'],
                where: {
                    organizationId,
                    userId: { in: pageUserIds },
                    ...businessWhere,
                },
                _count: { _all: true },
                _max: { scheduledFor: true, createdAt: true },
            }),
            this.prisma.transaction.groupBy({
                by: ['buyerUserId'],
                where: {
                    organizationId,
                    buyerUserId: { in: pageUserIds },
                    status: 'SUCCEEDED',
                    ...businessWhere,
                },
                _count: { _all: true },
                _sum: { grossAmount: true },
                _max: { createdAt: true },
            }),
            this.prisma.conversation.groupBy({
                by: ['customerUserId'],
                where: {
                    organizationId,
                    customerUserId: { in: pageUserIds },
                    ...businessWhere,
                },
                _count: { _all: true },
                _max: { lastMessageAt: true },
            }),
        ]);

        const bookingStatusMap = new Map<string, Record<string, number>>();
        for (const row of bookingStatusStats) {
            if (!row.userId) continue;
            const byStatus = bookingStatusMap.get(row.userId) ?? {};
            byStatus[row.status] = row._count._all;
            bookingStatusMap.set(row.userId, byStatus);
        }

        const bookingOverallMap = new Map<string, {
            totalBookings: number;
            lastBookingAt: Date | null;
            firstBookingAt: Date | null;
        }>();
        for (const row of bookingOverallStats) {
            if (!row.userId) continue;
            bookingOverallMap.set(row.userId, {
                totalBookings: row._count._all,
                lastBookingAt: row._max.scheduledFor ?? null,
                firstBookingAt: row._max.createdAt ?? null,
            });
        }

        const transactionMap = new Map<string, {
            totalPurchases: number;
            totalSpent: number;
            lastPurchaseAt: Date | null;
        }>();
        for (const row of transactionStats) {
            if (!row.buyerUserId) continue;
            transactionMap.set(row.buyerUserId, {
                totalPurchases: row._count._all,
                totalSpent: Number(row._sum.grossAmount?.toString() ?? '0'),
                lastPurchaseAt: row._max.createdAt ?? null,
            });
        }

        const conversationMap = new Map<string, {
            totalConversations: number;
            lastMessageAt: Date | null;
        }>();
        for (const row of conversationStats) {
            conversationMap.set(row.customerUserId, {
                totalConversations: row._count._all,
                lastMessageAt: row._max.lastMessageAt ?? null,
            });
        }

        const data = users.map((user) => {
            const bookings = bookingOverallMap.get(user.id);
            const statusBreakdown = bookingStatusMap.get(user.id) ?? {};
            const transactions = transactionMap.get(user.id);
            const conversations = conversationMap.get(user.id);

            const totalBookings = bookings?.totalBookings ?? 0;
            const totalSpent = transactions?.totalSpent ?? 0;
            const totalConversations = conversations?.totalConversations ?? 0;
            const segment = this.resolveSegment(totalBookings, totalSpent, totalConversations);

            const lastActivityAt = this.maxDate(
                bookings?.lastBookingAt ?? null,
                transactions?.lastPurchaseAt ?? null,
                conversations?.lastMessageAt ?? null,
            );

            return {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    createdAt: user.createdAt,
                },
                segment,
                stats: {
                    totalBookings,
                    pendingBookings: statusBreakdown.PENDING ?? 0,
                    confirmedBookings: statusBreakdown.CONFIRMED ?? 0,
                    completedBookings: statusBreakdown.COMPLETED ?? 0,
                    canceledBookings: statusBreakdown.CANCELED ?? 0,
                    noShowBookings: statusBreakdown.NO_SHOW ?? 0,
                    totalPurchases: transactions?.totalPurchases ?? 0,
                    totalSpent,
                    totalConversations,
                    lastActivityAt,
                },
            };
        });

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getCustomerHistory(
        organizationId: string,
        customerUserId: string,
        businessId?: string,
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: customerUserId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException('Cliente no encontrado');
        }

        const businessWhere = businessId ? { businessId } : {};

        const [bookings, transactions, conversations] = await Promise.all([
            this.prisma.booking.findMany({
                where: {
                    organizationId,
                    userId: customerUserId,
                    ...businessWhere,
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    promotion: {
                        select: {
                            id: true,
                            title: true,
                            couponCode: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 40,
            }),
            this.prisma.transaction.findMany({
                where: {
                    organizationId,
                    buyerUserId: customerUserId,
                    ...businessWhere,
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    booking: {
                        select: {
                            id: true,
                            status: true,
                            scheduledFor: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 40,
            }),
            this.prisma.conversation.findMany({
                where: {
                    organizationId,
                    customerUserId,
                    ...businessWhere,
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 20,
                        include: {
                            senderUser: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    convertedBooking: {
                        select: {
                            id: true,
                            status: true,
                            scheduledFor: true,
                        },
                    },
                },
                orderBy: { lastMessageAt: 'desc' },
                take: 20,
            }),
        ]);

        const totalSpent = transactions.reduce(
            (sum, row) => sum + Number(row.grossAmount.toString()),
            0,
        );

        const segment = this.resolveSegment(
            bookings.length,
            totalSpent,
            conversations.length,
        );

        return {
            customer: user,
            segment,
            summary: {
                totalBookings: bookings.length,
                totalTransactions: transactions.length,
                totalConversations: conversations.length,
                totalSpent,
            },
            bookings,
            transactions,
            conversations,
        };
    }

    async listSalesPipeline(
        organizationId: string,
        query: ListSalesPipelineQueryDto,
    ) {
        const limit = query.limit ?? 40;

        const where: Prisma.SalesLeadWhereInput = {
            organizationId,
            deletedAt: null,
        };

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.stage) {
            where.stage = query.stage;
        }

        const [data, groupedCounts, total] = await Promise.all([
            this.prisma.salesLead.findMany({
                where,
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    customerUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    conversation: {
                        select: {
                            id: true,
                            status: true,
                            lastMessageAt: true,
                        },
                    },
                    booking: {
                        select: {
                            id: true,
                            status: true,
                            scheduledFor: true,
                        },
                    },
                    createdByUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: [{ createdAt: 'desc' }],
                take: limit,
            }),
            this.prisma.salesLead.groupBy({
                by: ['stage'],
                where: {
                    organizationId,
                    deletedAt: null,
                },
                _count: {
                    _all: true,
                },
            }),
            this.prisma.salesLead.count({ where }),
        ]);

        const summary = {
            total,
            byStage: {
                LEAD: 0,
                QUOTED: 0,
                BOOKED: 0,
                PAID: 0,
                LOST: 0,
            } as Record<SalesLeadStage, number>,
        };

        for (const row of groupedCounts) {
            summary.byStage[row.stage] = row._count._all;
        }

        return {
            data,
            summary,
        };
    }

    async createSalesLead(
        organizationId: string,
        actorUserId: string,
        dto: CreateSalesLeadDto,
    ) {
        const business = await this.prisma.business.findFirst({
            where: {
                id: dto.businessId,
                organizationId,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado en la organizacion activa');
        }

        if (dto.customerUserId) {
            const customer = await this.prisma.user.findUnique({
                where: { id: dto.customerUserId },
                select: { id: true },
            });
            if (!customer) {
                throw new NotFoundException('Cliente no encontrado');
            }
        }

        if (dto.conversationId) {
            const conversation = await this.prisma.conversation.findFirst({
                where: {
                    id: dto.conversationId,
                    organizationId,
                    businessId: dto.businessId,
                    deletedAt: null,
                },
                select: { id: true },
            });

            if (!conversation) {
                throw new NotFoundException('Conversacion no encontrada para la organizacion activa');
            }
        }

        if (dto.bookingId) {
            const booking = await this.prisma.booking.findFirst({
                where: {
                    id: dto.bookingId,
                    organizationId,
                    businessId: dto.businessId,
                    deletedAt: null,
                },
                select: { id: true },
            });

            if (!booking) {
                throw new NotFoundException('Reserva no encontrada para la organizacion activa');
            }
        }

        return this.prisma.salesLead.create({
            data: {
                organizationId,
                businessId: dto.businessId,
                customerUserId: dto.customerUserId ?? null,
                createdByUserId: actorUserId,
                conversationId: dto.conversationId ?? null,
                bookingId: dto.bookingId ?? null,
                title: dto.title.trim(),
                notes: dto.notes?.trim() || null,
                estimatedValue: dto.estimatedValue,
                expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
            },
            include: {
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                customerUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                conversation: {
                    select: {
                        id: true,
                        status: true,
                        lastMessageAt: true,
                    },
                },
                booking: {
                    select: {
                        id: true,
                        status: true,
                        scheduledFor: true,
                    },
                },
            },
        });
    }

    async updateSalesLeadStage(
        organizationId: string,
        leadId: string,
        dto: UpdateSalesLeadStageDto,
    ) {
        const lead = await this.prisma.salesLead.findFirst({
            where: {
                id: leadId,
                organizationId,
                deletedAt: null,
            },
            select: {
                id: true,
                stage: true,
            },
        });

        if (!lead) {
            throw new NotFoundException('Lead no encontrado');
        }

        if (dto.stage === 'LOST' && !dto.lostReason?.trim()) {
            throw new BadRequestException('Debes indicar la razon cuando el lead se marca como perdido');
        }

        const isClosedStage = dto.stage === 'PAID' || dto.stage === 'LOST';

        return this.prisma.salesLead.update({
            where: { id: lead.id },
            data: {
                stage: dto.stage,
                closedAt: isClosedStage ? new Date() : null,
                lostReason: dto.stage === 'LOST' ? dto.lostReason?.trim() || null : null,
            },
            include: {
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                customerUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                conversation: {
                    select: {
                        id: true,
                        status: true,
                        lastMessageAt: true,
                    },
                },
                booking: {
                    select: {
                        id: true,
                        status: true,
                        scheduledFor: true,
                    },
                },
            },
        });
    }

    private resolveSegment(
        totalBookings: number,
        totalSpent: number,
        totalConversations: number,
    ): CustomerSegment {
        if (totalBookings >= 10 || totalSpent >= 50_000) {
            return 'VIP';
        }

        if (totalBookings >= 3 || totalConversations >= 5 || totalSpent >= 10_000) {
            return 'FRECUENTE';
        }

        return 'NUEVO';
    }

    private maxDate(...values: Array<Date | null>): Date | null {
        const valid = values.filter((value): value is Date => value instanceof Date);
        if (valid.length === 0) {
            return null;
        }

        return valid.reduce((max, current) => (current > max ? current : max));
    }
}
