import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    ConversationStatus,
    MessageSenderRole,
    OrganizationRole,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    ConvertConversationToBookingDto,
    CreateConversationDto,
    ListConversationsQueryDto,
    SendConversationMessageDto,
    UpdateConversationStatusDto,
} from './dto/messaging.dto';

@Injectable()
export class MessagingService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async createConversation(
        customerUserId: string,
        dto: CreateConversationDto,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id: dto.businessId },
            select: {
                id: true,
                organizationId: true,
                verified: true,
                name: true,
            },
        });

        if (!business || !business.verified) {
            throw new BadRequestException('Negocio no disponible para mensajería');
        }

        const content = dto.message.trim();
        if (!content) {
            throw new BadRequestException('El contenido del mensaje es obligatorio');
        }

        return this.prisma.$transaction(async (tx) => {
            const conversation = await tx.conversation.create({
                data: {
                    organizationId: business.organizationId,
                    businessId: business.id,
                    customerUserId,
                    subject: dto.subject?.trim() || `Consulta para ${business.name}`,
                    status: 'OPEN',
                    lastMessageAt: new Date(),
                },
            });

            await tx.conversationMessage.create({
                data: {
                    conversationId: conversation.id,
                    senderUserId: customerUserId,
                    senderRole: 'CUSTOMER',
                    content,
                },
            });

            return tx.conversation.findUnique({
                where: { id: conversation.id },
                include: this.conversationInclude(),
            });
        });
    }

    async listMyConversations(
        customerUserId: string,
        query: ListConversationsQueryDto,
    ) {
        const where: Prisma.ConversationWhereInput = {
            customerUserId,
        };
        return this.listConversations(where, query);
    }

    async listOrganizationConversations(
        organizationId: string,
        query: ListConversationsQueryDto,
    ) {
        const where: Prisma.ConversationWhereInput = {
            organizationId,
        };
        return this.listConversations(where, query);
    }

    async getConversationThreadForCustomer(
        conversationId: string,
        customerUserId: string,
        globalRole: string,
    ) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            include: this.threadInclude(),
        });

        if (!conversation) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (globalRole !== 'ADMIN' && conversation.customerUserId !== customerUserId) {
            throw new ForbiddenException('No tienes acceso a esta conversación');
        }

        return conversation;
    }

    async getConversationThreadForOrganization(
        conversationId: string,
        organizationId: string,
        globalRole: string,
    ) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            include: this.threadInclude(),
        });

        if (!conversation) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (globalRole !== 'ADMIN' && conversation.organizationId !== organizationId) {
            throw new NotFoundException('Conversación no encontrada');
        }

        return conversation;
    }

    async sendMessageAsCustomer(
        conversationId: string,
        customerUserId: string,
        globalRole: string,
        dto: SendConversationMessageDto,
    ) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                customerUserId: true,
                status: true,
            },
        });

        if (!conversation) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (globalRole !== 'ADMIN' && conversation.customerUserId !== customerUserId) {
            throw new ForbiddenException('No tienes acceso a esta conversación');
        }

        if (conversation.status === 'CLOSED') {
            throw new BadRequestException('La conversación está cerrada');
        }

        const content = dto.content.trim();
        if (!content) {
            throw new BadRequestException('El contenido del mensaje es obligatorio');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.conversationMessage.create({
                data: {
                    conversationId,
                    senderUserId: customerUserId,
                    senderRole: 'CUSTOMER',
                    content,
                },
            });

            await tx.conversation.update({
                where: { id: conversationId },
                data: {
                    lastMessageAt: new Date(),
                    status: conversation.status === 'CLOSED' ? 'OPEN' : conversation.status,
                },
            });
        });

        return this.getConversationThreadForCustomer(conversationId, customerUserId, globalRole);
    }

    async sendMessageAsOrganization(
        conversationId: string,
        organizationId: string,
        senderUserId: string,
        globalRole: string,
        organizationRole: OrganizationRole | null,
        dto: SendConversationMessageDto,
    ) {
        this.assertCanManageConversation(globalRole, organizationRole);

        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                organizationId: true,
                status: true,
            },
        });

        if (!conversation) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (globalRole !== 'ADMIN' && conversation.organizationId !== organizationId) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (conversation.status === 'CLOSED') {
            throw new BadRequestException('La conversación está cerrada');
        }

        const content = dto.content.trim();
        if (!content) {
            throw new BadRequestException('El contenido del mensaje es obligatorio');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.conversationMessage.create({
                data: {
                    conversationId,
                    senderUserId,
                    senderRole: 'BUSINESS_STAFF',
                    content,
                },
            });

            await tx.conversation.update({
                where: { id: conversationId },
                data: {
                    lastMessageAt: new Date(),
                    status: conversation.status === 'CLOSED' ? 'OPEN' : conversation.status,
                },
            });
        });

        return this.getConversationThreadForOrganization(conversationId, organizationId, globalRole);
    }

    async updateConversationStatus(
        conversationId: string,
        organizationId: string,
        globalRole: string,
        organizationRole: OrganizationRole | null,
        dto: UpdateConversationStatusDto,
    ) {
        this.assertCanManageConversation(globalRole, organizationRole);

        if (dto.status === 'CONVERTED') {
            throw new BadRequestException('Usa el endpoint de convertir a reserva');
        }

        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!conversation) {
            throw new NotFoundException('Conversación no encontrada');
        }

        if (globalRole !== 'ADMIN' && conversation.organizationId !== organizationId) {
            throw new NotFoundException('Conversación no encontrada');
        }

        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
                status: dto.status,
                lastMessageAt: new Date(),
            },
        });

        return this.getConversationThreadForOrganization(conversationId, organizationId, globalRole);
    }

    async convertConversationToBooking(
        conversationId: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: ConvertConversationToBookingDto,
    ) {
        if (actorGlobalRole !== 'ADMIN' && organizationRole === 'STAFF') {
            throw new ForbiddenException('El rol STAFF no puede convertir conversaciones en reservas');
        }

        const scheduledFor = new Date(dto.scheduledFor);
        if (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date()) {
            throw new BadRequestException('La fecha de reserva debe ser válida y futura');
        }

        if (
            dto.quotedAmount !== undefined &&
            dto.depositAmount !== undefined &&
            dto.depositAmount > dto.quotedAmount
        ) {
            throw new BadRequestException('El depósito no puede exceder el monto cotizado');
        }

        return this.prisma.$transaction(async (tx) => {
            const conversation = await tx.conversation.findUnique({
                where: { id: conversationId },
                select: {
                    id: true,
                    organizationId: true,
                    businessId: true,
                    customerUserId: true,
                    status: true,
                    convertedBookingId: true,
                    subject: true,
                },
            });

            if (!conversation) {
                throw new NotFoundException('Conversación no encontrada');
            }

            if (actorGlobalRole !== 'ADMIN' && conversation.organizationId !== organizationId) {
                throw new NotFoundException('Conversación no encontrada');
            }

            if (conversation.convertedBookingId) {
                throw new BadRequestException('La conversación ya está vinculada a una reserva');
            }

            if (dto.promotionId) {
                const promotion = await tx.promotion.findUnique({
                    where: { id: dto.promotionId },
                    select: {
                        id: true,
                        businessId: true,
                        organizationId: true,
                        isActive: true,
                        startsAt: true,
                        endsAt: true,
                    },
                });

                if (
                    !promotion ||
                    promotion.businessId !== conversation.businessId ||
                    promotion.organizationId !== conversation.organizationId
                ) {
                    throw new BadRequestException('La promoción no aplica para esta conversación');
                }

                const now = new Date();
                if (!promotion.isActive || promotion.startsAt > now || promotion.endsAt < now) {
                    throw new BadRequestException('La promoción no está activa');
                }
            }

            const booking = await tx.booking.create({
                data: {
                    organizationId: conversation.organizationId,
                    businessId: conversation.businessId,
                    userId: conversation.customerUserId,
                    promotionId: dto.promotionId,
                    status: 'PENDING',
                    source: 'DASHBOARD',
                    scheduledFor,
                    partySize: dto.partySize,
                    notes: this.composeBookingNotes(conversation.subject, dto.notes),
                    quotedAmount: dto.quotedAmount !== undefined ? String(dto.quotedAmount) : null,
                    depositAmount: dto.depositAmount !== undefined ? String(dto.depositAmount) : null,
                    currency: dto.currency?.trim().toUpperCase() ?? 'DOP',
                },
                select: {
                    id: true,
                    status: true,
                    scheduledFor: true,
                },
            });

            await tx.conversation.update({
                where: { id: conversationId },
                data: {
                    status: 'CONVERTED',
                    convertedBookingId: booking.id,
                    lastMessageAt: new Date(),
                },
            });

            await tx.conversationMessage.create({
                data: {
                    conversationId,
                    senderRole: 'SYSTEM',
                    content: `Conversación convertida a reserva (${booking.id})`,
                },
            });

            return booking;
        });
    }

    private async listConversations(
        baseWhere: Prisma.ConversationWhereInput,
        query: ListConversationsQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const where: Prisma.ConversationWhereInput = {
            ...baseWhere,
        };

        if (query.status) {
            where.status = query.status;
        }

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.search?.trim()) {
            const needle = query.search.trim();
            where.OR = [
                { subject: { contains: needle, mode: 'insensitive' } },
                { business: { name: { contains: needle, mode: 'insensitive' } } },
                { customerUser: { name: { contains: needle, mode: 'insensitive' } } },
                { messages: { some: { content: { contains: needle, mode: 'insensitive' } } } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.conversation.findMany({
                where,
                include: this.conversationInclude(),
                orderBy: { lastMessageAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.conversation.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    private assertCanManageConversation(
        globalRole: string,
        organizationRole: OrganizationRole | null,
    ): void {
        if (globalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole) {
            throw new ForbiddenException('No tienes permisos para gestionar conversaciones');
        }
    }

    private composeBookingNotes(
        subject: string | null,
        customNotes?: string,
    ): string | undefined {
        const fragments: string[] = [];
        if (subject) {
            fragments.push(`Origen conversación: ${subject}`);
        }
        if (customNotes?.trim()) {
            fragments.push(customNotes.trim());
        }

        return fragments.length > 0 ? fragments.join('\n') : undefined;
    }

    private conversationInclude(): Prisma.ConversationInclude {
        return {
            business: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    verified: true,
                },
            },
            customerUser: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            convertedBooking: {
                select: {
                    id: true,
                    status: true,
                    scheduledFor: true,
                },
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                    id: true,
                    content: true,
                    senderRole: true,
                    senderUserId: true,
                    createdAt: true,
                },
            },
            _count: {
                select: {
                    messages: true,
                },
            },
        };
    }

    private threadInclude(): Prisma.ConversationInclude {
        return {
            business: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    verified: true,
                },
            },
            customerUser: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            convertedBooking: {
                select: {
                    id: true,
                    status: true,
                    scheduledFor: true,
                },
            },
            messages: {
                orderBy: { createdAt: 'asc' },
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
        };
    }
}
