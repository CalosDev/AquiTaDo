import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from '../observability/observability.service';

type SendTextRequest = {
    to: string;
    text: string;
    previewUrl?: boolean;
};

type SendLocationRequest = {
    to: string;
    latitude: number;
    longitude: number;
    name: string;
    address?: string;
};

type SendResult = {
    sent: boolean;
    providerMessageId: string | null;
    rawResponse: unknown;
};

/**
 * Outbound client for WhatsApp Cloud API with graceful no-config fallback.
 */
@Injectable()
export class WhatsAppOutboundService {
    private readonly logger = new Logger(WhatsAppOutboundService.name);
    private readonly apiVersion: string;
    private readonly graphBaseUrl: string;
    private readonly phoneNumberId: string | null;
    private readonly accessToken: string | null;
    private readonly enabled: boolean;

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) {
        this.apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION')?.trim() || 'v20.0';
        this.graphBaseUrl = this.configService.get<string>('WHATSAPP_GRAPH_BASE_URL')?.trim()
            || 'https://graph.facebook.com';
        this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim() || null;
        this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim() || null;
        const enabledFlag = (this.configService.get<string>('WHATSAPP_ENABLED')?.trim() || 'false').toLowerCase();
        this.enabled = (enabledFlag === 'true' || enabledFlag === '1')
            && !!this.phoneNumberId
            && !!this.accessToken;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Sends a text message via WhatsApp Cloud API.
     */
    async sendTextMessage(request: SendTextRequest): Promise<SendResult> {
        const startedAt = Date.now();
        let success = false;
        const phone = this.normalizePhone(request.to);
        const text = request.text.trim();

        if (!phone || !text) {
            return {
                sent: false,
                providerMessageId: null,
                rawResponse: { reason: 'invalid_phone_or_text' },
            };
        }

        if (!this.enabled || !this.phoneNumberId || !this.accessToken) {
            return {
                sent: false,
                providerMessageId: `simulated-${Date.now()}`,
                rawResponse: { reason: 'whatsapp_disabled' },
            };
        }

        const url = `${this.graphBaseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'text',
                    text: {
                        body: text.slice(0, 4096),
                        preview_url: request.previewUrl ?? false,
                    },
                }),
            });

            const rawResponse = await this.parseJson(response);
            if (!response.ok) {
                this.logger.warn(
                    `Failed to send WhatsApp message (${response.status}): ${JSON.stringify(rawResponse)}`,
                );
                return {
                    sent: false,
                    providerMessageId: null,
                    rawResponse,
                };
            }

            success = true;
            const providerMessageId = this.extractProviderMessageId(rawResponse);
            return {
                sent: true,
                providerMessageId,
                rawResponse,
            };
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'whatsapp',
                'send_text',
                Date.now() - startedAt,
                success,
            );
        }
    }

    /**
     * Sends a location payload via WhatsApp Cloud API.
     */
    async sendLocationMessage(request: SendLocationRequest): Promise<SendResult> {
        const startedAt = Date.now();
        let success = false;
        const phone = this.normalizePhone(request.to);

        if (!phone) {
            return {
                sent: false,
                providerMessageId: null,
                rawResponse: { reason: 'invalid_phone' },
            };
        }

        if (!this.enabled || !this.phoneNumberId || !this.accessToken) {
            return {
                sent: false,
                providerMessageId: `simulated-location-${Date.now()}`,
                rawResponse: { reason: 'whatsapp_disabled' },
            };
        }

        const url = `${this.graphBaseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'location',
                    location: {
                        latitude: request.latitude,
                        longitude: request.longitude,
                        name: request.name.slice(0, 100),
                        address: request.address?.slice(0, 300) || undefined,
                    },
                }),
            });

            const rawResponse = await this.parseJson(response);
            if (!response.ok) {
                this.logger.warn(
                    `Failed to send WhatsApp location (${response.status}): ${JSON.stringify(rawResponse)}`,
                );
                return {
                    sent: false,
                    providerMessageId: null,
                    rawResponse,
                };
            }

            success = true;
            const providerMessageId = this.extractProviderMessageId(rawResponse);
            return {
                sent: true,
                providerMessageId,
                rawResponse,
            };
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'whatsapp',
                'send_location',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private normalizePhone(rawPhone: string): string | null {
        const digits = rawPhone.replace(/[^\d]/g, '');
        if (digits.length < 8) {
            return null;
        }
        return digits;
    }

    private async parseJson(response: Response): Promise<unknown> {
        const contentType = response.headers.get('content-type') ?? '';
        const rawText = await response.text();
        if (!contentType.includes('application/json')) {
            return rawText;
        }

        try {
            return rawText ? JSON.parse(rawText) : {};
        } catch {
            return rawText;
        }
    }

    private extractProviderMessageId(rawResponse: unknown): string | null {
        if (!rawResponse || typeof rawResponse !== 'object') {
            return null;
        }

        const messages = (rawResponse as { messages?: unknown }).messages;
        if (!Array.isArray(messages) || messages.length === 0) {
            return null;
        }

        const message = messages[0];
        if (!message || typeof message !== 'object') {
            return null;
        }

        const id = (message as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
    }
}
