import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import OpenAI from 'openai';
import { ObservabilityService } from '../observability/observability.service';

type ChatRequest = {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
};

type ProviderPreference = 'auto' | 'gemini' | 'local';
type ExternalProvider = 'gemini';
type ChatProvider = 'gemini' | 'groq';
type ProviderName = ExternalProvider | 'local-fallback';

/**
 * Wraps model access and provides deterministic fallbacks when an API key is unavailable.
 */
@Injectable()
export class AiProviderService {
    private readonly logger = new Logger(AiProviderService.name);
    private readonly tracer = trace.getTracer('aquita-api');
    private readonly primaryClient: OpenAI | null;
    private readonly groqClient: OpenAI | null;
    private readonly embeddingModel: string;
    private readonly primaryChatModel: string;
    private readonly groqChatModel: string;
    private readonly embeddingDimensions: number;
    private readonly providerName: ProviderName;

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) {
        this.embeddingDimensions = this.resolveEmbeddingDimensions();
        const providerPreference = this.resolveProviderPreference();
        const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim() || null;
        const geminiBaseUrl = this.configService.get<string>('GEMINI_BASE_URL')?.trim()
            || 'https://generativelanguage.googleapis.com/v1beta/openai';
        const groqApiKey = this.configService.get<string>('GROQ_API_KEY')?.trim() || null;
        const groqBaseUrl = this.configService.get<string>('GROQ_BASE_URL')?.trim()
            || 'https://api.groq.com/openai/v1';

        const externalProvider = this.resolveExternalProvider(
            providerPreference,
            geminiApiKey,
        );

        if (!externalProvider) {
            this.providerName = 'local-fallback';
            this.primaryClient = null;
            this.primaryChatModel = 'local-fallback';
            this.embeddingModel = 'local-fallback';
            this.groqClient = groqApiKey
                ? new OpenAI({
                    apiKey: groqApiKey,
                    baseURL: groqBaseUrl,
                })
                : null;
            this.groqChatModel = this.resolveGroqChatModel();

            if (this.groqClient) {
                this.logger.log(
                    `AI fallback configured: groq (chat=${this.groqChatModel})`,
                );
            }
            this.logger.warn(
                'No external AI provider configured (GEMINI_API_KEY); using deterministic local fallbacks',
            );
            return;
        }

        this.providerName = externalProvider;
        this.primaryChatModel = this.resolveChatModel(externalProvider);
        this.embeddingModel = this.resolveEmbeddingModel(externalProvider);

        this.primaryClient = new OpenAI({
            apiKey: geminiApiKey as string,
            baseURL: geminiBaseUrl,
        });
        this.groqClient = groqApiKey
            ? new OpenAI({
                apiKey: groqApiKey,
                baseURL: groqBaseUrl,
            })
            : null;
        this.groqChatModel = this.resolveGroqChatModel();

        this.logger.log(
            `AI provider configured: ${this.providerName} (chat=${this.primaryChatModel}, embedding=${this.embeddingModel})`,
        );
        if (this.groqClient) {
            this.logger.log(
                `AI chat fallback enabled: groq (chat=${this.groqChatModel})`,
            );
        }
    }

    isExternalAiEnabled(): boolean {
        return this.primaryClient !== null;
    }

    getEmbeddingDimensions(): number {
        return this.embeddingDimensions;
    }

    getProviderName(): string {
        return this.providerName;
    }

    /**
     * Generates an embedding vector for semantic retrieval.
     */
    async createEmbedding(text: string): Promise<number[]> {
        return this.tracer.startActiveSpan('ai.create_embedding', async (span) => {
            const startedAt = Date.now();
            const normalizedText = text.trim();
            const provider = this.providerName;
            let success = true;
            span.setAttribute('ai.provider', provider);
            span.setAttribute('ai.embedding_model', this.embeddingModel);
            span.setAttribute('ai.input_length', normalizedText.length);

            if (!normalizedText) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return this.createDeterministicEmbedding('empty');
            }

            if (!this.primaryClient) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return this.createDeterministicEmbedding(normalizedText);
            }

            try {
                const response = await this.primaryClient.embeddings.create({
                    model: this.embeddingModel,
                    input: normalizedText,
                });

                const vector = response.data[0]?.embedding;
                if (!Array.isArray(vector) || vector.length === 0) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'empty_embedding_vector' });
                    return this.createDeterministicEmbedding(normalizedText);
                }

                span.setStatus({ code: SpanStatusCode.OK });
                return this.coerceEmbeddingDimensions(vector.map((entry) => Number(entry)));
            } catch (error) {
                success = false;
                span.recordException(error as Error);
                span.setStatus({ code: SpanStatusCode.ERROR });
                this.logger.warn(
                    `Embedding request failed; using fallback (${error instanceof Error ? error.message : String(error)})`,
                );
                return this.createDeterministicEmbedding(normalizedText);
            } finally {
                this.observabilityService.trackExternalDependencyCall(
                    'ai',
                    'embedding',
                    Date.now() - startedAt,
                    success,
                );
                span.end();
            }
        });
    }

    /**
     * Generates a conversational answer from the chosen model provider.
     */
    async generateChatCompletion(request: ChatRequest): Promise<string> {
        return this.tracer.startActiveSpan('ai.generate_chat_completion', async (span) => {
            const startedAt = Date.now();
            const systemPrompt = request.systemPrompt.trim();
            const userPrompt = request.userPrompt.trim();
            const provider = this.providerName;
            const primaryChatProvider = this.providerName === 'local-fallback'
                ? null
                : this.providerName;
            let success = true;

            span.setAttribute('ai.provider', provider);
            span.setAttribute('ai.chat_model', this.primaryChatModel);
            span.setAttribute('ai.user_prompt_length', userPrompt.length);
            span.setAttribute('ai.system_prompt_length', systemPrompt.length);

            const failureReasons: string[] = [];

            try {
                if (this.primaryClient && primaryChatProvider) {
                    try {
                        const primaryResponse = await this.requestChatWithProvider(
                            this.primaryClient,
                            this.primaryChatModel,
                            request,
                            primaryChatProvider,
                        );
                        span.setStatus({ code: SpanStatusCode.OK });
                        return primaryResponse;
                    } catch (error) {
                        const reason = error instanceof Error ? error.message : String(error);
                        failureReasons.push(`primary:${this.providerName}:${reason}`);
                        this.logger.warn(
                            `Primary chat provider failed (${this.providerName}); attempting fallback when available (${reason})`,
                        );
                    }
                }

                if (this.groqClient) {
                    try {
                        const fallbackResponse = await this.requestChatWithProvider(
                            this.groqClient,
                            this.groqChatModel,
                            request,
                            'groq',
                        );
                        span.setAttribute('ai.chat_fallback_provider', 'groq');
                        span.setStatus({ code: SpanStatusCode.OK });
                        return fallbackResponse;
                    } catch (error) {
                        const reason = error instanceof Error ? error.message : String(error);
                        failureReasons.push(`fallback:groq:${reason}`);
                        this.logger.warn(
                            `Groq fallback chat provider failed (${reason})`,
                        );
                    }
                }

                success = false;
                span.setStatus({ code: SpanStatusCode.ERROR });
                const mode = this.primaryClient
                    ? 'provider-temporary-unavailable'
                    : 'provider-not-configured';

                return this.generateFallbackCompletion(systemPrompt, userPrompt, {
                    mode,
                    provider: this.providerName,
                    reason: failureReasons.join(' | ') || 'no_available_chat_provider',
                });
            } catch (error) {
                success = false;
                span.recordException(error as Error);
                span.setStatus({ code: SpanStatusCode.ERROR });
                this.logger.warn(
                    `Chat completion failed; using fallback (${error instanceof Error ? error.message : String(error)})`,
                );
                return this.generateFallbackCompletion(systemPrompt, userPrompt, {
                    mode: 'provider-temporary-unavailable',
                    provider: this.providerName,
                    reason: error instanceof Error ? error.message : String(error),
                });
            } finally {
                this.observabilityService.trackExternalDependencyCall(
                    'ai',
                    'chat_completion',
                    Date.now() - startedAt,
                    success,
                );
                span.end();
            }
        });
    }

    private resolveEmbeddingDimensions(): number {
        const raw = this.configService.get<string>('AI_EMBEDDING_DIMENSIONS')?.trim();
        if (!raw) {
            return 1536;
        }

        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 64 || parsed > 4096) {
            return 1536;
        }

        return parsed;
    }

    private resolveProviderPreference(): ProviderPreference {
        const raw = this.configService.get<string>('AI_PROVIDER')?.trim().toLowerCase();
        if (raw === 'gemini' || raw === 'local' || raw === 'auto') {
            return raw;
        }

        return 'auto';
    }

    private resolveExternalProvider(
        preference: ProviderPreference,
        geminiApiKey: string | null,
    ): ExternalProvider | null {
        if (preference === 'local') {
            return null;
        }

        if (preference === 'gemini') {
            return geminiApiKey ? 'gemini' : null;
        }

        if (geminiApiKey) {
            return 'gemini';
        }

        return null;
    }

    private resolveChatModel(provider: ExternalProvider): string {
        if (provider !== 'gemini') {
            return 'gemini-2.0-flash';
        }

        return this.configService.get<string>('GEMINI_MODEL_CHAT')?.trim()
            || 'gemini-2.0-flash';
    }

    private resolveEmbeddingModel(provider: ExternalProvider): string {
        if (provider !== 'gemini') {
            return 'gemini-embedding-001';
        }

        return this.configService.get<string>('GEMINI_MODEL_EMBEDDING')?.trim()
            || 'gemini-embedding-001';
    }

    private resolveGroqChatModel(): string {
        return this.configService.get<string>('GROQ_MODEL_CHAT')?.trim()
            || 'llama-3.3-70b-versatile';
    }

    private async requestChatWithProvider(
        client: OpenAI,
        model: string,
        request: ChatRequest,
        provider: ChatProvider,
    ): Promise<string> {
        const startedAt = Date.now();
        let success = true;

        try {
            const completion = await client.chat.completions.create({
                model,
                temperature: request.temperature ?? 0.2,
                max_tokens: request.maxTokens ?? 600,
                messages: [
                    { role: 'system', content: request.systemPrompt.trim() },
                    { role: 'user', content: request.userPrompt.trim() },
                ],
            });

            const content = completion.choices[0]?.message?.content;
            const parsed = this.extractMessageContent(content);
            if (!parsed) {
                throw new Error(`empty_model_response:${provider}`);
            }

            return parsed;
        } catch (error) {
            success = false;
            throw error;
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'ai',
                `chat_completion_${provider}`,
                Date.now() - startedAt,
                success,
            );
        }
    }

    private extractMessageContent(raw: unknown): string | null {
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            return trimmed.length > 0 ? trimmed : null;
        }

        if (!Array.isArray(raw)) {
            return null;
        }

        const chunks: string[] = [];
        for (const part of raw) {
            if (!part || typeof part !== 'object') {
                continue;
            }

            const text = (part as { text?: unknown }).text;
            if (typeof text === 'string' && text.trim().length > 0) {
                chunks.push(text.trim());
            }
        }

        if (chunks.length === 0) {
            return null;
        }

        return chunks.join('\n');
    }

    private createDeterministicEmbedding(text: string): number[] {
        const values = Array.from({ length: this.embeddingDimensions }, () => 0);
        const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        for (let index = 0; index < normalized.length; index += 1) {
            const code = normalized.charCodeAt(index);
            const bucket = (code * (index + 17)) % this.embeddingDimensions;
            const signed = index % 2 === 0 ? 1 : -1;
            values[bucket] += signed * ((code % 31) + 1);
        }

        const magnitude = Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));
        if (magnitude === 0) {
            return values;
        }

        return values.map((value) => value / magnitude);
    }

    private coerceEmbeddingDimensions(rawVector: number[]): number[] {
        const vector = rawVector.filter((entry) => Number.isFinite(entry));
        if (vector.length === 0) {
            return this.createDeterministicEmbedding('empty');
        }

        if (vector.length === this.embeddingDimensions) {
            return this.normalizeVector(vector);
        }

        // Resample vectors to keep pgvector dimensions stable regardless of provider model defaults.
        const resized = Array.from({ length: this.embeddingDimensions }, (_, targetIndex) => {
            if (this.embeddingDimensions === 1) {
                return vector[0] ?? 0;
            }

            const sourcePosition = (targetIndex * (vector.length - 1)) / (this.embeddingDimensions - 1);
            const leftIndex = Math.floor(sourcePosition);
            const rightIndex = Math.min(leftIndex + 1, vector.length - 1);
            const mix = sourcePosition - leftIndex;
            const leftValue = vector[leftIndex] ?? 0;
            const rightValue = vector[rightIndex] ?? leftValue;
            return leftValue + ((rightValue - leftValue) * mix);
        });

        return this.normalizeVector(resized);
    }

    private normalizeVector(vector: number[]): number[] {
        const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + (value * value), 0));
        if (magnitude === 0) {
            return vector;
        }

        return vector.map((value) => value / magnitude);
    }

    private generateFallbackCompletion(
        systemPrompt: string,
        userPrompt: string,
        options: {
            mode: 'provider-not-configured' | 'provider-temporary-unavailable';
            provider: ProviderName;
            reason?: string;
        },
    ): string {
        const firstSentence = userPrompt.split('\n').find((entry) => entry.trim().length > 0)
            ?? 'No se recibio una consulta valida.';
        const reason = options.reason?.trim();

        const providerLine = options.provider === 'local-fallback'
            ? 'Proveedor IA: local-fallback'
            : `Proveedor IA: ${options.provider}`;

        const statusLine = options.mode === 'provider-not-configured'
            ? 'Estoy operando en modo local porque no hay proveedor externo configurado.'
            : 'Estoy operando en modo local por una indisponibilidad temporal del proveedor IA (ejemplo: cuota o limite de peticiones).';

        const actionLine = options.mode === 'provider-not-configured'
            ? 'Configura AI_PROVIDER y GEMINI_API_KEY (o GROQ_API_KEY como fallback de chat) para respuestas enriquecidas.'
            : 'Intenta nuevamente en unos minutos o revisa cuota/rate-limits del proveedor.';

        return [
            'Asistente AquiTaDo (modo fallback):',
            firstSentence.trim(),
            '',
            providerLine,
            statusLine,
            actionLine,
            reason ? `Detalle tecnico: ${reason}` : '',
            '',
            `Contexto aplicado: ${systemPrompt.slice(0, 140)}...`,
        ].filter((line) => line.length > 0).join('\n');
    }
}
