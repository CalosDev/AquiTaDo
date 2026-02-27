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

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
        this.embeddingModel = this.configService.get<string>('OPENAI_MODEL_EMBEDDING')?.trim()
            || 'text-embedding-3-small';
        this.chatModel = this.configService.get<string>('OPENAI_MODEL_CHAT')?.trim()
            || 'gpt-4o-mini';
        this.embeddingDimensions = this.resolveEmbeddingDimensions();
        this.openAiClient = apiKey
            ? new OpenAI({ apiKey })
            : null;

        if (!this.openAiClient) {
            this.logger.warn('OpenAI API key not configured; using deterministic local fallbacks');
        }
    }

    isOpenAiEnabled(): boolean {
        return this.openAiClient !== null;
    }

    getEmbeddingDimensions(): number {
        return this.embeddingDimensions;
    }

    getProviderName(): string {
        return this.openAiClient ? 'openai' : 'local-fallback';
    }

    /**
     * Generates an embedding vector for semantic retrieval.
     */
    async createEmbedding(text: string): Promise<number[]> {
        return this.tracer.startActiveSpan('ai.create_embedding', async (span) => {
            const startedAt = Date.now();
            const normalizedText = text.trim();
            const provider = this.openAiClient ? 'openai' : 'local-fallback';
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
                return vector.map((entry) => Number(entry));
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
            const provider = this.openAiClient ? 'openai' : 'local-fallback';
            let success = true;

            span.setAttribute('ai.provider', provider);
            span.setAttribute('ai.chat_model', this.chatModel);
            span.setAttribute('ai.user_prompt_length', userPrompt.length);
            span.setAttribute('ai.system_prompt_length', systemPrompt.length);

            if (!this.openAiClient) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return this.generateFallbackCompletion(systemPrompt, userPrompt);
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

                return this.generateFallbackCompletion(systemPrompt, userPrompt);
            } catch (error) {
                success = false;
                span.recordException(error as Error);
                span.setStatus({ code: SpanStatusCode.ERROR });
                this.logger.warn(
                    `Chat completion failed; using fallback (${error instanceof Error ? error.message : String(error)})`,
                );
                return this.generateFallbackCompletion(systemPrompt, userPrompt);
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
        const raw = this.configService.get<string>('OPENAI_EMBEDDING_DIMENSIONS')?.trim();
        if (!raw) {
            return 1536;
        }

        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 64 || parsed > 4096) {
            return 1536;
        }

        return parsed;
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

    private generateFallbackCompletion(systemPrompt: string, userPrompt: string): string {
        const firstSentence = userPrompt.split('\n').find((entry) => entry.trim().length > 0)
            ?? 'No se recibio una consulta valida.';
        return [
            'Asistente AquiTaDo (modo fallback):',
            firstSentence.trim(),
            '',
            'Estoy operando sin proveedor externo de IA. Revisa la configuracion OPENAI_API_KEY para respuestas enriquecidas.',
            '',
            `Contexto aplicado: ${systemPrompt.slice(0, 140)}...`,
        ].join('\n');
    }
}
