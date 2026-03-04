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

type ProviderPreference = 'auto' | 'openai' | 'gemini' | 'local';
type ExternalProvider = 'openai' | 'gemini';
type ProviderName = ExternalProvider | 'local-fallback';

/**
 * Wraps model access and provides deterministic fallbacks when an API key is unavailable.
 */
@Injectable()
export class AiProviderService {
    private readonly logger = new Logger(AiProviderService.name);
    private readonly tracer = trace.getTracer('aquita-api');
    private readonly openAiClient: OpenAI | null;
    private readonly embeddingModel: string;
    private readonly chatModel: string;
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
        const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
        const openAiBaseUrl = this.configService.get<string>('OPENAI_BASE_URL')?.trim() || undefined;
        const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim() || null;
        const geminiBaseUrl = this.configService.get<string>('GEMINI_BASE_URL')?.trim()
            || 'https://generativelanguage.googleapis.com/v1beta/openai';

        const externalProvider = this.resolveExternalProvider(
            providerPreference,
            openAiApiKey,
            geminiApiKey,
        );

        if (!externalProvider) {
            this.providerName = 'local-fallback';
            this.openAiClient = null;
            this.chatModel = 'local-fallback';
            this.embeddingModel = 'local-fallback';
            this.logger.warn(
                'No external AI provider configured (OPENAI_API_KEY/GEMINI_API_KEY); using deterministic local fallbacks',
            );
            return;
        }

        this.providerName = externalProvider;
        this.chatModel = this.resolveChatModel(externalProvider);
        this.embeddingModel = this.resolveEmbeddingModel(externalProvider);

        this.openAiClient = new OpenAI({
            apiKey: externalProvider === 'openai'
                ? openAiApiKey as string
                : geminiApiKey as string,
            baseURL: externalProvider === 'openai' ? openAiBaseUrl : geminiBaseUrl,
        });

        this.logger.log(
            `AI provider configured: ${this.providerName} (chat=${this.chatModel}, embedding=${this.embeddingModel})`,
        );
    }

    isOpenAiEnabled(): boolean {
        return this.openAiClient !== null;
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

            if (!this.openAiClient) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return this.createDeterministicEmbedding(normalizedText);
            }

            try {
                const response = await this.openAiClient.embeddings.create({
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
            let success = true;

            span.setAttribute('ai.provider', provider);
            span.setAttribute('ai.chat_model', this.chatModel);
            span.setAttribute('ai.user_prompt_length', userPrompt.length);
            span.setAttribute('ai.system_prompt_length', systemPrompt.length);

            if (!this.openAiClient) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return this.generateFallbackCompletion(systemPrompt, userPrompt, {
                    mode: 'provider-not-configured',
                    provider: this.providerName,
                });
            }

            try {
                const completion = await this.openAiClient.chat.completions.create({
                    model: this.chatModel,
                    temperature: request.temperature ?? 0.2,
                    max_tokens: request.maxTokens ?? 600,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                });

                const content = completion.choices[0]?.message?.content;
                const parsed = this.extractMessageContent(content);
                span.setStatus({ code: SpanStatusCode.OK });
                if (parsed) {
                    return parsed;
                }

                return this.generateFallbackCompletion(systemPrompt, userPrompt, {
                    mode: 'provider-temporary-unavailable',
                    provider: this.providerName,
                    reason: 'empty_model_response',
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
        const raw = this.configService.get<string>('AI_EMBEDDING_DIMENSIONS')?.trim()
            || this.configService.get<string>('OPENAI_EMBEDDING_DIMENSIONS')?.trim();
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
        if (raw === 'openai' || raw === 'gemini' || raw === 'local' || raw === 'auto') {
            return raw;
        }

        return 'auto';
    }

    private resolveExternalProvider(
        preference: ProviderPreference,
        openAiApiKey: string | null,
        geminiApiKey: string | null,
    ): ExternalProvider | null {
        if (preference === 'local') {
            return null;
        }

        if (preference === 'openai') {
            return openAiApiKey ? 'openai' : null;
        }

        if (preference === 'gemini') {
            return geminiApiKey ? 'gemini' : null;
        }

        if (openAiApiKey) {
            return 'openai';
        }

        if (geminiApiKey) {
            return 'gemini';
        }

        return null;
    }

    private resolveChatModel(provider: ExternalProvider): string {
        if (provider === 'gemini') {
            return this.configService.get<string>('GEMINI_MODEL_CHAT')?.trim()
                || 'gemini-2.0-flash';
        }

        return this.configService.get<string>('OPENAI_MODEL_CHAT')?.trim()
            || 'gpt-4o-mini';
    }

    private resolveEmbeddingModel(provider: ExternalProvider): string {
        if (provider === 'gemini') {
            return this.configService.get<string>('GEMINI_MODEL_EMBEDDING')?.trim()
                || 'text-embedding-004';
        }

        return this.configService.get<string>('OPENAI_MODEL_EMBEDDING')?.trim()
            || 'text-embedding-3-small';
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
            ? 'Configura AI_PROVIDER y OPENAI_API_KEY/GEMINI_API_KEY para respuestas enriquecidas.'
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
