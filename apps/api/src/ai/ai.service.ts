import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationRole, ReviewSentiment } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AskConciergeDto } from './dto/ask-concierge.dto';
import { BusinessAssistantConfigDto } from './dto/business-assistant-config.dto';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingsService } from './ai-embeddings.service';

type ConciergeMatch = {
    id: string;
    name: string;
    slug: string;
    address: string;
    score: number;
    whatsapp: string | null;
    latitude: number | null;
    longitude: number | null;
    link: string;
};

type SentimentAnalysisResult = {
    reviewId: string;
    organizationId: string;
    businessId: string;
    businessName: string;
    sentiment: ReviewSentiment;
    score: number;
    summary: string | null;
    isNegative: boolean;
};

/**
 * Orchestrates RAG querying, business auto-responses, and review sentiment analysis.
 */
@Injectable()
export class AiService {
    private readonly appWebBaseUrl: string;

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(AiProviderService)
        private readonly aiProviderService: AiProviderService,
        @Inject(AiEmbeddingsService)
        private readonly aiEmbeddingsService: AiEmbeddingsService,
    ) {
        this.appWebBaseUrl = (this.configService.get<string>('APP_PUBLIC_WEB_URL')?.trim() || 'http://localhost:8080')
            .replace(/\/+$/, '');
    }

    async askConcierge(dto: AskConciergeDto) {
        const normalizedQuery = dto.query.trim();
        if (!normalizedQuery) {
            throw new BadRequestException('La consulta no puede estar vacia');
        }

        const retrieval = await this.aiEmbeddingsService.searchByText(normalizedQuery, {
            categoryId: dto.categoryId,
            provinceId: dto.provinceId,
            cityId: dto.cityId,
            limit: dto.limit ?? 8,
        });

        const matches: ConciergeMatch[] = retrieval.data.map((entry) => ({
            id: entry.businessId,
            name: entry.name,
            slug: entry.slug,
            address: entry.address,
            score: Number(entry.score.toFixed(4)),
            whatsapp: entry.whatsapp,
            latitude: entry.latitude,
            longitude: entry.longitude,
            link: `${this.appWebBaseUrl}/businesses/${entry.slug}`,
        }));

        const context = matches
            .map((entry, index) => (
                `${index + 1}. ${entry.name}\n` +
                `Direccion: ${entry.address}\n` +
                `WhatsApp: ${entry.whatsapp ?? 'No disponible'}\n` +
                `Perfil: ${entry.link}\n` +
                `Afinidad: ${entry.score}`
            ))
            .join('\n\n');

        const answer = await this.aiProviderService.generateChatCompletion({
            systemPrompt: [
                'Eres el asistente de AquiTaDo para Republica Dominicana.',
                'Responde de forma profesional, cercana y breve.',
                'Entiendes contexto local como colmado, concho, pica pollo y geografia de RD.',
                'Cuando recomiendes negocios, cita solo los negocios del contexto recuperado.',
            ].join(' '),
            userPrompt: [
                `Consulta del usuario: ${normalizedQuery}`,
                '',
                'Negocios recuperados:',
                context || 'No se recuperaron negocios relevantes.',
                '',
                'Genera una respuesta util con recomendaciones priorizadas y siguiente accion.',
            ].join('\n'),
        });

        return {
            answer,
            data: matches,
            meta: {
                source: retrieval.source,
                query: normalizedQuery,
                modelProvider: this.aiProviderService.getProviderName(),
            },
        };
    }

    async generateBusinessAutoReply(
        businessId: string,
        userMessage: string,
        customerName?: string,
    ): Promise<{ reply: string; businessName: string; organizationId: string }> {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                organizationId: true,
                address: true,
                description: true,
                phone: true,
                whatsapp: true,
                aiAutoResponderEnabled: true,
                aiAutoResponderPrompt: true,
                categories: {
                    select: {
                        category: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                features: {
                    select: {
                        feature: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (!business.aiAutoResponderEnabled) {
            throw new BadRequestException('El auto-respondedor IA no esta habilitado para este negocio');
        }

        const categories = business.categories.map((entry) => entry.category.name).join(', ');
        const features = business.features.map((entry) => entry.feature.name).join(', ');
        const customPrompt = business.aiAutoResponderPrompt?.trim();

        const systemPrompt = [
            'Eres un asistente comercial de AquiTaDo para responder por un negocio local en RD.',
            'Responde en tono cordial, concreto y orientado a cerrar reserva o compra.',
            'Si no tienes un dato, dilo de forma transparente y sugiere contacto directo.',
            customPrompt ? `Instrucciones del negocio: ${customPrompt}` : '',
            `Datos del negocio: nombre=${business.name}; direccion=${business.address}; descripcion=${business.description}; telefono=${business.phone ?? 'n/a'}; whatsapp=${business.whatsapp ?? 'n/a'}; categorias=${categories || 'n/a'}; facilidades=${features || 'n/a'}.`,
        ]
            .filter((entry) => entry.length > 0)
            .join(' ');

        const reply = await this.aiProviderService.generateChatCompletion({
            systemPrompt,
            userPrompt: [
                `Cliente: ${customerName?.trim() || 'Cliente sin nombre'}`,
                `Mensaje: ${userMessage.trim()}`,
                'Responde maximo en 4 lineas y cierra con una llamada a la accion.',
            ].join('\n'),
        });

        return {
            reply,
            businessName: business.name,
            organizationId: business.organizationId,
        };
    }

    async updateBusinessAssistantConfig(
        businessId: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: BusinessAssistantConfigDto,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                organizationId: true,
                aiAutoResponderEnabled: true,
                aiAutoResponderPrompt: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (actorGlobalRole !== 'ADMIN' && business.organizationId !== organizationId) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (actorGlobalRole !== 'ADMIN') {
            if (!organizationRole || organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para configurar el asistente IA');
            }
        }

        return this.prisma.business.update({
            where: { id: businessId },
            data: {
                aiAutoResponderEnabled: dto.enabled ?? business.aiAutoResponderEnabled,
                aiAutoResponderPrompt: dto.customPrompt?.trim() ?? business.aiAutoResponderPrompt,
            },
            select: {
                id: true,
                aiAutoResponderEnabled: true,
                aiAutoResponderPrompt: true,
                aiLastEmbeddedAt: true,
            },
        });
    }

    async reindexBusinessEmbedding(
        businessId: string,
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                organizationId: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (actorGlobalRole !== 'ADMIN' && business.organizationId !== organizationId) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (actorGlobalRole !== 'ADMIN' && (!organizationRole || organizationRole === 'STAFF')) {
            throw new ForbiddenException('No tienes permisos para reindexar este negocio');
        }

        await this.aiEmbeddingsService.upsertBusinessEmbedding(businessId);
        return {
            businessId,
            status: 'indexed',
        };
    }

    async analyzeReviewSentiment(reviewId: string): Promise<SentimentAnalysisResult> {
        const review = await this.prisma.review.findUnique({
            where: { id: reviewId },
            select: {
                id: true,
                rating: true,
                comment: true,
                businessId: true,
                business: {
                    select: {
                        id: true,
                        name: true,
                        organizationId: true,
                    },
                },
            },
        });

        if (!review) {
            throw new NotFoundException('Resena no encontrada');
        }

        const defaultSentiment = this.sentimentFromRating(review.rating);
        const defaultScore = this.scoreFromRating(review.rating);
        const baseSummary = review.comment?.trim() || `Resena de ${review.rating}/5 sin comentario.`;

        let sentiment = defaultSentiment;
        let score = defaultScore;
        let summary = baseSummary.slice(0, 500);

        if (review.comment?.trim()) {
            const rawAnalysis = await this.aiProviderService.generateChatCompletion({
                systemPrompt: [
                    'Analiza sentimiento de resenas para negocios locales.',
                    'Devuelve JSON estricto con keys: sentiment, score, summary.',
                    'sentiment debe ser POSITIVE, NEUTRAL o NEGATIVE.',
                    'score entre -1 y 1.',
                ].join(' '),
                userPrompt: [
                    `Rating: ${review.rating}/5`,
                    `Comentario: ${review.comment}`,
                    'Responde solo JSON.',
                ].join('\n'),
                temperature: 0,
                maxTokens: 220,
            });

            const parsed = this.parseJsonObject(rawAnalysis);
            if (parsed) {
                const parsedSentiment = this.normalizeSentiment(parsed['sentiment']);
                const parsedScore = this.normalizeScore(parsed['score']);
                const parsedSummary = this.normalizeSummary(parsed['summary']);
                sentiment = parsedSentiment ?? defaultSentiment;
                score = parsedScore ?? defaultScore;
                summary = parsedSummary ?? baseSummary.slice(0, 500);
            }
        }

        await this.prisma.reviewSentimentInsight.upsert({
            where: { reviewId: review.id },
            update: {
                sentiment,
                score: score.toFixed(4),
                summary,
                model: this.aiProviderService.getProviderName(),
            },
            create: {
                reviewId: review.id,
                businessId: review.businessId,
                organizationId: review.business.organizationId,
                sentiment,
                score: score.toFixed(4),
                summary,
                model: this.aiProviderService.getProviderName(),
            },
        });

        return {
            reviewId: review.id,
            organizationId: review.business.organizationId,
            businessId: review.business.id,
            businessName: review.business.name,
            sentiment,
            score,
            summary,
            isNegative: sentiment === 'NEGATIVE',
        };
    }

    async markReviewSentimentAlerted(reviewId: string): Promise<void> {
        await this.prisma.reviewSentimentInsight.update({
            where: { reviewId },
            data: { alertedAt: new Date() },
            select: { id: true },
        });
    }

    private parseJsonObject(raw: string): Record<string, unknown> | null {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        const direct = this.tryParseJson(trimmed);
        if (direct) {
            return direct;
        }

        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start === -1 || end <= start) {
            return null;
        }

        return this.tryParseJson(trimmed.slice(start, end + 1));
    }

    private tryParseJson(raw: string): Record<string, unknown> | null {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return null;
            }
            return parsed as Record<string, unknown>;
        } catch {
            return null;
        }
    }

    private sentimentFromRating(rating: number): ReviewSentiment {
        if (rating >= 4) {
            return 'POSITIVE';
        }
        if (rating <= 2) {
            return 'NEGATIVE';
        }
        return 'NEUTRAL';
    }

    private scoreFromRating(rating: number): number {
        const normalized = (rating - 3) / 2;
        return Number(normalized.toFixed(4));
    }

    private normalizeSentiment(raw: unknown): ReviewSentiment | null {
        if (typeof raw !== 'string') {
            return null;
        }

        const normalized = raw.trim().toUpperCase();
        if (normalized === 'POSITIVE' || normalized === 'NEUTRAL' || normalized === 'NEGATIVE') {
            return normalized;
        }
        return null;
    }

    private normalizeScore(raw: unknown): number | null {
        const parsed = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(parsed)) {
            return null;
        }
        return Math.max(-1, Math.min(1, Number(parsed.toFixed(4))));
    }

    private normalizeSummary(raw: unknown): string | null {
        if (typeof raw !== 'string') {
            return null;
        }

        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        return trimmed.slice(0, 500);
    }
}

