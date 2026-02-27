import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { GrowthEventType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
    CreateClickToChatDto,
    ListWhatsAppConversationsDto,
    UpdateWhatsAppConversationStatusDto,
} from './dto/click-to-chat.dto';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';

type ParsedIncomingMessage = {
    externalMessageId: string | null;
    from: string;
    toPhoneNumberId: string | null;
    text: string;
    profileName: string | null;
};

/**
 * Handles inbound/outbound WhatsApp orchestration, webhook processing and analytics tracking.
 */
@Injectable()
export class WhatsAppService {
    private readonly logger = new Logger(WhatsAppService.name);
    private readonly verifyToken: string | null;

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(AiService)
        private readonly aiService: AiService,
        @Inject(WhatsAppOutboundService)
        private readonly whatsAppOutboundService: WhatsAppOutboundService,
    ) {
        this.verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN')?.trim() || null;
    }

    verifyWebhookChallenge(mode?: string, token?: string, challenge?: string): string {
        if (!mode || !token || !challenge) {
            throw new BadRequestException('Missing WhatsApp webhook query params');
        }

        if (mode !== 'subscribe') {
            throw new ForbiddenException('Invalid webhook mode');
        }

        if (!this.verifyToken || token !== this.verifyToken) {
            throw new ForbiddenException('Invalid webhook verification token');
        }

        return challenge;
    }

    async handleWebhookPayload(payload: unknown): Promise<{ processedMessages: number }> {
        const webhookEvent = await this.prisma.whatsAppWebhookEvent.create({
            data: {
                payload: (payload ?? {}) as Prisma.InputJsonValue,
                source: 'meta',
                processingStatus: 'RECEIVED',
            },
            select: { id: true },
        });

        try {
            const messages = this.parseIncomingMessages(payload);
            for (const message of messages) {
                await this.processIncomingMessage(message);
            }

            await this.prisma.whatsAppWebhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    processingStatus: 'PROCESSED',
                    processedAt: new Date(),
                    externalEventId: messages[0]?.externalMessageId ?? null,
                },
                select: { id: true },
            });

            return {
                processedMessages: messages.length,
            };
        } catch (error) {
            await this.prisma.whatsAppWebhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    processingStatus: 'FAILED',
                    errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
                    processedAt: new Date(),
                },
                select: { id: true },
            });
            throw error;
        }
    }

    async createClickToChatLink(
        dto: CreateClickToChatDto,
        userId?: string,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id: dto.businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                whatsapp: true,
                organizationId: true,
                provinceId: true,
                cityId: true,
                categories: {
                    select: {
                        categoryId: true,
                    },
                    take: 1,
                },
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (!business.whatsapp) {
            throw new BadRequestException('Este negocio no tiene WhatsApp configurado');
        }

        const initialMessage = `Hola, vi tu negocio en AquiTaDo y quiero info [biz:${business.id}]`;
        const normalizedPhone = business.whatsapp.replace(/[^\d]/g, '');
        const url = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(initialMessage)}`;
        const source = dto.source?.trim() || 'web';
        const sessionId = dto.sessionId?.trim() || null;
        const visitorIdHash = dto.visitorId?.trim()
            ? createHash('sha256').update(dto.visitorId.trim()).digest('hex').slice(0, 64)
            : null;
        const variantKey = dto.variantKey?.trim() || null;

        const conversion = await this.prisma.$transaction(async (tx) => {
            const created = await tx.whatsAppClickConversion.create({
                data: {
                    businessId: business.id,
                    organizationId: business.organizationId,
                    userId: userId ?? null,
                    source,
                    sessionId,
                    targetPhone: business.whatsapp,
                    metadata: ({
                        businessSlug: business.slug,
                        generatedLink: url,
                    } as Prisma.InputJsonValue),
                },
                select: {
                    id: true,
                    clickedAt: true,
                },
            });

            await tx.growthEvent.create({
                data: {
                    eventType: GrowthEventType.WHATSAPP_CLICK,
                    businessId: business.id,
                    organizationId: business.organizationId,
                    userId: userId ?? null,
                    categoryId: business.categories[0]?.categoryId ?? null,
                    provinceId: business.provinceId,
                    cityId: business.cityId,
                    visitorIdHash,
                    sessionId,
                    variantKey,
                    metadata: ({
                        source,
                        conversionId: created.id,
                    } as Prisma.InputJsonValue),
                    occurredAt: new Date(),
                },
                select: { id: true },
            });

            return created;
        });

        return {
            conversionId: conversion.id,
            url,
            clickedAt: conversion.clickedAt,
        };
    }

    async listOrganizationConversations(
        organizationId: string,
        query: ListWhatsAppConversationsDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const where: Prisma.WhatsAppConversationWhereInput = {
            organizationId,
        };

        if (query.status) {
            where.status = query.status;
        }

        const [data, total] = await Promise.all([
            this.prisma.whatsAppConversation.findMany({
                where,
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
                        take: 1,
                        select: {
                            id: true,
                            direction: true,
                            status: true,
                            content: true,
                            createdAt: true,
                        },
                    },
                },
                orderBy: { lastMessageAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.whatsAppConversation.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.max(Math.ceil(total / limit), 1),
        };
    }

    async updateConversationStatus(
        organizationId: string,
        conversationId: string,
        dto: UpdateWhatsAppConversationStatusDto,
    ) {
        const conversation = await this.prisma.whatsAppConversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!conversation || conversation.organizationId !== organizationId) {
            throw new NotFoundException('Conversacion no encontrada');
        }

        return this.prisma.whatsAppConversation.update({
            where: { id: conversationId },
            data: {
                status: dto.status,
                autoResponderActive: dto.autoResponderActive,
            },
            select: {
                id: true,
                status: true,
                autoResponderActive: true,
                updatedAt: true,
            },
        });
    }

    private async processIncomingMessage(message: ParsedIncomingMessage): Promise<void> {
        const businessId = this.extractBusinessIdFromMessage(message.text);

        let scopedBusiness: {
            id: string;
            name: string;
            organizationId: string;
            aiAutoResponderEnabled: boolean;
            latitude: number | null;
            longitude: number | null;
        } | null = null;

        if (businessId) {
            scopedBusiness = await this.prisma.business.findUnique({
                where: { id: businessId },
                select: {
                    id: true,
                    name: true,
                    organizationId: true,
                    aiAutoResponderEnabled: true,
                    latitude: true,
                    longitude: true,
                },
            });
        }

        const previousConversation = await this.prisma.whatsAppConversation.findFirst({
            where: {
                customerPhone: message.from,
            },
            orderBy: { lastMessageAt: 'desc' },
            select: {
                id: true,
                organizationId: true,
                businessId: true,
            },
        });

        const organizationId = scopedBusiness?.organizationId ?? previousConversation?.organizationId ?? null;
        const businessContextId = scopedBusiness?.id ?? previousConversation?.businessId ?? null;

        let conversationId: string | null = null;

        if (organizationId) {
            const existingConversation = await this.prisma.whatsAppConversation.findFirst({
                where: {
                    organizationId,
                    businessId: businessContextId,
                    customerPhone: message.from,
                },
                select: { id: true },
            });

            if (existingConversation) {
                conversationId = existingConversation.id;
                await this.prisma.whatsAppConversation.update({
                    where: { id: conversationId },
                    data: {
                        customerName: message.profileName ?? undefined,
                        lastMessageAt: new Date(),
                    },
                    select: { id: true },
                });
            } else {
                const createdConversation = await this.prisma.whatsAppConversation.create({
                    data: {
                        organizationId,
                        businessId: businessContextId,
                        customerPhone: message.from,
                        customerName: message.profileName,
                        status: 'OPEN',
                        lastMessageAt: new Date(),
                        autoResponderActive: true,
                    },
                    select: { id: true },
                });
                conversationId = createdConversation.id;
            }
        }

        if (conversationId) {
            await this.prisma.whatsAppMessage.create({
                data: {
                    conversationId,
                    direction: 'INBOUND',
                    status: 'RECEIVED',
                    whatsappMessageId: message.externalMessageId,
                    senderPhone: message.from,
                    recipientPhone: message.toPhoneNumberId,
                    messageType: 'text',
                    content: message.text,
                    payload: ({
                        profileName: message.profileName,
                    } as Prisma.InputJsonValue),
                },
                select: { id: true },
            });
        }

        const response = await this.buildResponseForMessage(
            message.text,
            businessContextId,
            message.profileName,
        );

        const outbound = await this.whatsAppOutboundService.sendTextMessage({
            to: message.from,
            text: response.text,
            previewUrl: true,
        });

        if (response.location) {
            await this.whatsAppOutboundService.sendLocationMessage({
                to: message.from,
                latitude: response.location.latitude,
                longitude: response.location.longitude,
                name: response.location.name,
                address: response.location.address,
            });
        }

        if (conversationId) {
            await this.prisma.whatsAppMessage.create({
                data: {
                    conversationId,
                    direction: 'OUTBOUND',
                    status: outbound.sent ? 'SENT' : 'FAILED',
                    whatsappMessageId: outbound.providerMessageId,
                    senderPhone: message.toPhoneNumberId,
                    recipientPhone: message.from,
                    messageType: response.location ? 'mixed' : 'text',
                    content: response.text,
                    payload: (outbound.rawResponse ?? null) as Prisma.InputJsonValue,
                    processedAt: new Date(),
                },
                select: { id: true },
            });
        }
    }

    private async buildResponseForMessage(
        inboundText: string,
        businessId: string | null,
        profileName: string | null,
    ): Promise<{
        text: string;
        location?: { latitude: number; longitude: number; name: string; address?: string };
    }> {
        const normalizedText = inboundText.trim();
        if (businessId) {
            const business = await this.prisma.business.findUnique({
                where: { id: businessId },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    latitude: true,
                    longitude: true,
                    aiAutoResponderEnabled: true,
                },
            });

            if (business?.aiAutoResponderEnabled) {
                const autoReply = await this.aiService.generateBusinessAutoReply(
                    business.id,
                    normalizedText,
                    profileName ?? undefined,
                );

                const text = `${autoReply.reply}\n\nPara hablar con el equipo, responde a este chat y te asistimos.`;
                if (
                    typeof business.latitude === 'number'
                    && typeof business.longitude === 'number'
                ) {
                    return {
                        text,
                        location: {
                            latitude: business.latitude,
                            longitude: business.longitude,
                            name: business.name,
                            address: business.address,
                        },
                    };
                }

                return { text };
            }
        }

        const concierge = await this.aiService.askConcierge({
            query: normalizedText,
            limit: 5,
        });

        const top = concierge.data.slice(0, 3);
        const links = top.map((entry, index) => `${index + 1}. ${entry.name}: ${entry.link}`).join('\n');
        const text = [
            concierge.answer,
            links ? '\nOpciones sugeridas:\n' + links : '',
            '\nSi quieres, dime presupuesto, zona o tipo de comida y lo afinamos.',
        ].join('\n');

        const firstWithLocation = top.find(
            (entry) => typeof entry.latitude === 'number' && typeof entry.longitude === 'number',
        );

        if (firstWithLocation && typeof firstWithLocation.latitude === 'number' && typeof firstWithLocation.longitude === 'number') {
            return {
                text,
                location: {
                    latitude: firstWithLocation.latitude,
                    longitude: firstWithLocation.longitude,
                    name: firstWithLocation.name,
                    address: firstWithLocation.address,
                },
            };
        }

        return { text };
    }

    private parseIncomingMessages(payload: unknown): ParsedIncomingMessage[] {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const root = payload as {
            entry?: Array<{
                changes?: Array<{
                    value?: {
                        metadata?: { phone_number_id?: unknown };
                        contacts?: Array<{ profile?: { name?: unknown } }>;
                        messages?: Array<{
                            id?: unknown;
                            from?: unknown;
                            type?: unknown;
                            text?: { body?: unknown };
                            button?: { text?: unknown };
                            interactive?: { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } };
                        }>;
                    };
                }>;
            }>;
        };

        const parsed: ParsedIncomingMessage[] = [];

        for (const entry of root.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value;
                if (!value) {
                    continue;
                }

                const phoneNumberId = typeof value.metadata?.phone_number_id === 'string'
                    ? value.metadata.phone_number_id
                    : null;
                const profileName = typeof value.contacts?.[0]?.profile?.name === 'string'
                    ? value.contacts[0].profile.name
                    : null;

                for (const message of value.messages ?? []) {
                    const from = typeof message.from === 'string' ? message.from : null;
                    if (!from) {
                        continue;
                    }

                    const text = this.extractMessageText(message);
                    if (!text) {
                        continue;
                    }

                    parsed.push({
                        externalMessageId: typeof message.id === 'string' ? message.id : null,
                        from,
                        toPhoneNumberId: phoneNumberId,
                        text,
                        profileName,
                    });
                }
            }
        }

        return parsed;
    }

    private extractMessageText(message: {
        type?: unknown;
        text?: { body?: unknown };
        button?: { text?: unknown };
        interactive?: { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } };
    }): string | null {
        if (typeof message.text?.body === 'string' && message.text.body.trim().length > 0) {
            return message.text.body.trim();
        }

        if (typeof message.button?.text === 'string' && message.button.text.trim().length > 0) {
            return message.button.text.trim();
        }

        const buttonReply = message.interactive?.button_reply?.title;
        if (typeof buttonReply === 'string' && buttonReply.trim().length > 0) {
            return buttonReply.trim();
        }

        const listReply = message.interactive?.list_reply?.title;
        if (typeof listReply === 'string' && listReply.trim().length > 0) {
            return listReply.trim();
        }

        return null;
    }

    private extractBusinessIdFromMessage(text: string): string | null {
        const match = text.match(/\bbiz:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i);
        if (!match) {
            return null;
        }
        return match[1] ?? null;
    }
}
