import 'reflect-metadata';
import {
    BadRequestException,
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AdsController } from '../ads/ads.controller';
import { AdsService } from '../ads/ads.service';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { PaymentsController } from '../payments/payments.controller';
import { PaymentsService } from '../payments/payments.service';
import { AdvancedRateLimitGuard } from '../security/advanced-rate-limit.guard';
import { WhatsAppController } from '../whatsapp/whatsapp.controller';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

describe('Platform Modules (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const builder = Test.createTestingModule({
            controllers: [
                WhatsAppController,
                AdsController,
                PaymentsController,
            ],
            providers: [
                {
                    provide: WhatsAppService,
                    useValue: {
                        verifyWebhookChallenge: (
                            mode?: string,
                            token?: string,
                            challenge?: string,
                        ) => {
                            if (!mode || !token || !challenge) {
                                throw new BadRequestException('Missing WhatsApp webhook query params');
                            }
                            return challenge;
                        },
                        handleWebhookPayload: async () => ({ processedMessages: 0 }),
                        createClickToChatLink: async (dto: { businessId?: string }) => {
                            const businessId = typeof dto?.businessId === 'string'
                                ? dto.businessId.trim()
                                : '';
                            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                            if (!businessId || !uuidRegex.test(businessId)) {
                                throw new BadRequestException('businessId debe ser un UUID valido');
                            }
                            return { ok: true };
                        },
                        listOrganizationConversations: async () => ({ data: [] }),
                        updateConversationStatus: async () => ({ ok: true }),
                    },
                },
                {
                    provide: AdsService,
                    useValue: {
                        getPlacements: async () => ({ items: [] }),
                        trackImpression: async () => ({ ok: true }),
                        trackClick: async () => ({ ok: true }),
                        createCampaign: async () => ({ ok: true }),
                        listMyCampaigns: async () => ({ data: [] }),
                        updateCampaignStatus: async () => ({ ok: true }),
                    },
                },
                {
                    provide: PaymentsService,
                    useValue: {
                        handleStripeWebhook: async () => ({ received: true }),
                        listMyPayments: async () => ({ data: [] }),
                        listMyInvoices: async () => ({ data: [] }),
                        getBillingSummary: async () => ({ ok: true }),
                        exportInvoicesCsv: async () => ({ fileName: 'invoices.csv', csv: '' }),
                        exportPaymentsCsv: async () => ({ fileName: 'payments.csv', csv: '' }),
                        getFiscalSummary: async () => ({ ok: true }),
                        exportFiscalCsv: async () => ({ fileName: 'fiscal.csv', csv: '' }),
                        getAdsWalletOverview: async () => ({ data: [] }),
                        createAdsWalletCheckoutSession: async () => ({ ok: true }),
                        createBookingCheckoutSession: async () => ({ ok: true }),
                    },
                },
            ],
        });

        builder.overrideGuard(AdvancedRateLimitGuard).useValue({ canActivate: () => true });
        builder.overrideGuard(OptionalJwtAuthGuard).useValue({ canActivate: () => true });
        builder.overrideGuard(OrgContextGuard).useValue({ canActivate: () => true });
        builder.overrideGuard(OrgRolesGuard).useValue({ canActivate: () => true });
        builder.overrideGuard(JwtAuthGuard).useValue({
            canActivate: () => {
                throw new UnauthorizedException();
            },
        });

        const moduleRef = await builder.compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api');
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app?.close();
    });

    it('rejects missing WhatsApp webhook verification params', async () => {
        const response = await request(app.getHttpServer())
            .get('/api/whatsapp/webhook')
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('rejects invalid payload for click-to-chat conversion tracking', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/whatsapp/click-to-chat')
            .send({ businessId: 'not-a-uuid' })
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('rejects invalid ad campaign id on impression tracking', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/ads/campaigns/not-a-uuid/impression')
            .send({})
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('requires auth for ad campaign creation', async () => {
        await request(app.getHttpServer())
            .post('/api/ads/campaigns')
            .send({})
            .expect(401);
    });

    it('requires auth for listing payments', async () => {
        await request(app.getHttpServer())
            .get('/api/payments/my')
            .expect(401);
    });
});
