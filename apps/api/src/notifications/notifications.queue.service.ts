import { randomUUID } from 'node:crypto';
import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppOutboundService } from '../whatsapp/whatsapp-outbound.service';

export type BookingReminderPayload = {
    organizationId: string;
    businessId: string;
    bookingId: string;
    businessName: string;
    customerPhone: string | null;
    scheduledFor: string;
};

export type PromotionGeoAlertPayload = {
    organizationId: string;
    businessId: string;
    promotionId: string;
    title: string;
    message: string;
    targetPhones?: string[];
};

export type VerificationAlertPayload = {
    organizationId: string;
    businessId: string;
    ownerPhone: string | null;
    businessName: string;
    status: string;
    notes?: string | null;
};

export type NegativeReviewAlertPayload = {
    organizationId: string;
    businessId: string;
    businessName: string;
    businessWhatsapp: string | null;
    reviewId: string;
    summary: string;
};

export type PublicLeadAlertPayload = {
    organizationId: string;
    businessId: string;
    businessName: string;
    businessWhatsapp: string | null;
    ownerPhone: string | null;
    leadId: string;
    contactName: string;
    contactPhone: string;
    contactEmail?: string | null;
    message: string;
    preferredChannel?: string | null;
    createdAt: string;
};

type NotificationPayload =
    | BookingReminderPayload
    | PromotionGeoAlertPayload
    | VerificationAlertPayload
    | NegativeReviewAlertPayload
    | PublicLeadAlertPayload;

const JOB_NAME_BOOKING_REMINDER = 'whatsapp.booking.reminder';
const JOB_NAME_PROMOTION_GEO = 'whatsapp.promotion.geo';
const JOB_NAME_ACCOUNT_VERIFICATION = 'whatsapp.account.verification';
const JOB_NAME_NEGATIVE_REVIEW = 'whatsapp.review.negative';
const JOB_NAME_PUBLIC_LEAD = 'whatsapp.public.lead';

/**
 * BullMQ orchestrator for asynchronous notification workflows.
 */
@Injectable()
export class NotificationsQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NotificationsQueueService.name);
    private readonly queueName = 'aquita-notifications';
    private readonly queuePrefix: string;
    private readonly defaultAttempts: number;
    private queue: Queue | null = null;
    private worker: Worker | null = null;

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(WhatsAppOutboundService)
        private readonly whatsAppOutboundService: WhatsAppOutboundService,
    ) {
        this.queuePrefix = this.configService.get<string>('BULLMQ_PREFIX')?.trim() || 'aquita';
        const configuredAttempts = Number(this.configService.get<string>('BULLMQ_DEFAULT_ATTEMPTS') ?? '3');
        this.defaultAttempts = Number.isInteger(configuredAttempts) && configuredAttempts > 0
            ? configuredAttempts
            : 3;
    }

    async onModuleInit() {
        const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
        if (!redisUrl) {
            this.logger.warn('BullMQ disabled: REDIS_URL not configured');
            return;
        }
        if (!this.isRedisUrlValid(redisUrl)) {
            this.logger.warn('BullMQ disabled: REDIS_URL is invalid');
            return;
        }
        const redisReachable = await this.canReachRedis(redisUrl);
        if (!redisReachable) {
            this.logger.warn('BullMQ disabled: Redis authentication/connectivity failed');
            return;
        }

        const connection = {
            url: redisUrl,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        };

        this.queue = new Queue(this.queueName, {
            connection,
            prefix: this.queuePrefix,
        });

        this.worker = new Worker(
            this.queueName,
            async (job) => this.processJob(job),
            {
                connection,
                prefix: this.queuePrefix,
                concurrency: 5,
            },
        );

        this.worker.on('failed', (job, error) => {
            const jobId = job?.id ? String(job.id) : 'unknown';
            this.logger.warn(`Notification job failed (${jobId}): ${error.message}`);
        });
        this.worker.on('error', (error) => {
            this.logger.warn(`BullMQ worker error: ${error.message}`);
        });
        this.queue.on('error', (error) => {
            this.logger.warn(`BullMQ queue error: ${error.message}`);
        });

        this.logger.log(`BullMQ notification worker online (queue="${this.queueName}")`);
    }

    async onModuleDestroy() {
        await this.worker?.close();
        await this.queue?.close();
    }

    async enqueueBookingReminder(
        payload: BookingReminderPayload,
        scheduleAt?: Date,
    ): Promise<void> {
        await this.enqueueJob(JOB_NAME_BOOKING_REMINDER, payload, {
            organizationId: payload.organizationId,
            businessId: payload.businessId,
            topic: 'booking_reminder',
            scheduleAt,
        });
    }

    async enqueuePromotionGeoAlert(payload: PromotionGeoAlertPayload): Promise<void> {
        await this.enqueueJob(JOB_NAME_PROMOTION_GEO, payload, {
            organizationId: payload.organizationId,
            businessId: payload.businessId,
            topic: 'promotion_geo_alert',
        });
    }

    async enqueueVerificationAlert(payload: VerificationAlertPayload): Promise<void> {
        await this.enqueueJob(JOB_NAME_ACCOUNT_VERIFICATION, payload, {
            organizationId: payload.organizationId,
            businessId: payload.businessId,
            topic: 'account_verification',
        });
    }

    async enqueueNegativeReviewAlert(payload: NegativeReviewAlertPayload): Promise<void> {
        await this.enqueueJob(JOB_NAME_NEGATIVE_REVIEW, payload, {
            organizationId: payload.organizationId,
            businessId: payload.businessId,
            topic: 'negative_review_alert',
        });
    }

    async enqueuePublicLeadAlert(payload: PublicLeadAlertPayload): Promise<void> {
        await this.enqueueJob(JOB_NAME_PUBLIC_LEAD, payload, {
            organizationId: payload.organizationId,
            businessId: payload.businessId,
            topic: 'public_lead_alert',
        });
    }

    private async enqueueJob(
        jobName: string,
        payload: NotificationPayload,
        metadata: {
            organizationId?: string | null;
            businessId?: string | null;
            topic: string;
            scheduleAt?: Date;
        },
    ): Promise<void> {
        const delayMs = metadata.scheduleAt
            ? Math.max(metadata.scheduleAt.getTime() - Date.now(), 0)
            : 0;

        if (!this.queue) {
            const inlineQueueJobId = `inline-${randomUUID()}`;
            await this.prisma.notificationJob.create({
                data: {
                    queueJobId: inlineQueueJobId,
                    organizationId: metadata.organizationId ?? null,
                    businessId: metadata.businessId ?? null,
                    channel: 'WHATSAPP',
                    topic: metadata.topic,
                    payload: payload as Prisma.InputJsonValue,
                    status: 'PROCESSING',
                    attempts: 1,
                    availableAt: metadata.scheduleAt ?? new Date(),
                },
                select: { id: true },
            });

            try {
                await this.dispatchJob(jobName, payload);
                await this.prisma.notificationJob.update({
                    where: { queueJobId: inlineQueueJobId },
                    data: {
                        status: 'COMPLETED',
                        processedAt: new Date(),
                    },
                    select: { id: true },
                });
            } catch (error) {
                await this.prisma.notificationJob.update({
                    where: { queueJobId: inlineQueueJobId },
                    data: {
                        status: 'FAILED',
                        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
                        processedAt: new Date(),
                    },
                    select: { id: true },
                });
            }

            return;
        }

        const job = await this.queue.add(jobName, payload, {
            delay: delayMs,
            attempts: this.defaultAttempts,
            backoff: {
                type: 'exponential',
                delay: 15_000,
            },
            removeOnComplete: {
                age: 86_400,
                count: 1_000,
            },
            removeOnFail: {
                age: 604_800,
                count: 1_000,
            },
        });

        await this.prisma.notificationJob.create({
            data: {
                queueJobId: job.id ? String(job.id) : null,
                organizationId: metadata.organizationId ?? null,
                businessId: metadata.businessId ?? null,
                channel: 'WHATSAPP',
                topic: metadata.topic,
                payload: payload as Prisma.InputJsonValue,
                status: 'PENDING',
                attempts: 0,
                availableAt: metadata.scheduleAt ?? new Date(),
            },
            select: { id: true },
        });
    }

    private async processJob(job: Job): Promise<void> {
        const payload = job.data as NotificationPayload;
        const queueJobId = job.id ? String(job.id) : null;
        if (queueJobId) {
            await this.prisma.notificationJob.updateMany({
                where: { queueJobId },
                data: {
                    status: 'PROCESSING',
                    attempts: Math.max(job.attemptsMade + 1, 1),
                },
            });
        }

        try {
            await this.dispatchJob(job.name, payload);

            if (queueJobId) {
                await this.prisma.notificationJob.updateMany({
                    where: { queueJobId },
                    data: {
                        status: 'COMPLETED',
                        processedAt: new Date(),
                    },
                });
            }
        } catch (error) {
            if (queueJobId) {
                await this.prisma.notificationJob.updateMany({
                    where: { queueJobId },
                    data: {
                        status: 'FAILED',
                        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
                        processedAt: new Date(),
                    },
                });
            }

            throw error;
        }
    }

    private async dispatchJob(jobName: string, payload: NotificationPayload): Promise<void> {
        switch (jobName) {
            case JOB_NAME_BOOKING_REMINDER:
                await this.sendBookingReminder(payload as BookingReminderPayload);
                return;
            case JOB_NAME_PROMOTION_GEO:
                await this.sendPromotionGeoAlert(payload as PromotionGeoAlertPayload);
                return;
            case JOB_NAME_ACCOUNT_VERIFICATION:
                await this.sendVerificationAlert(payload as VerificationAlertPayload);
                return;
            case JOB_NAME_NEGATIVE_REVIEW:
                await this.sendNegativeReviewAlert(payload as NegativeReviewAlertPayload);
                return;
            case JOB_NAME_PUBLIC_LEAD:
                await this.sendPublicLeadAlert(payload as PublicLeadAlertPayload);
                return;
            default:
                this.logger.warn(`Unknown notification job "${jobName}" ignored`);
        }
    }

    private async sendBookingReminder(payload: BookingReminderPayload): Promise<void> {
        if (!payload.customerPhone) {
            return;
        }

        const bookingDate = new Date(payload.scheduledFor);
        const readableDate = Number.isNaN(bookingDate.getTime())
            ? payload.scheduledFor
            : bookingDate.toLocaleString('es-DO', { hour12: false });

        await this.whatsAppOutboundService.sendTextMessage({
            to: payload.customerPhone,
            text: [
                `Recordatorio AquiTaDo: tu reserva en ${payload.businessName} es para ${readableDate}.`,
                `Codigo de reserva: ${payload.bookingId}`,
                'Si necesitas reprogramar, responde a este mensaje.',
            ].join('\n'),
        });
    }

    private async sendPromotionGeoAlert(payload: PromotionGeoAlertPayload): Promise<void> {
        const targets = new Set<string>();
        for (const phone of payload.targetPhones ?? []) {
            const trimmed = phone.trim();
            if (trimmed) {
                targets.add(trimmed);
            }
        }

        if (targets.size === 0) {
            const recentConversations = await this.prisma.whatsAppConversation.findMany({
                where: {
                    organizationId: payload.organizationId,
                    status: 'OPEN',
                },
                select: {
                    customerPhone: true,
                },
                orderBy: { lastMessageAt: 'desc' },
                take: 25,
            });

            for (const conversation of recentConversations) {
                targets.add(conversation.customerPhone);
            }
        }

        for (const target of targets) {
            await this.whatsAppOutboundService.sendTextMessage({
                to: target,
                text: `Promo flash AquiTaDo: ${payload.title}\n${payload.message}`,
            });
        }
    }

    private async sendVerificationAlert(payload: VerificationAlertPayload): Promise<void> {
        if (!payload.ownerPhone) {
            return;
        }

        const note = payload.notes?.trim() ? `\nNotas: ${payload.notes.trim()}` : '';
        await this.whatsAppOutboundService.sendTextMessage({
            to: payload.ownerPhone,
            text: `Verificacion de cuenta (${payload.businessName}): ${payload.status}.${note}`,
        });
    }

    private async sendNegativeReviewAlert(payload: NegativeReviewAlertPayload): Promise<void> {
        if (!payload.businessWhatsapp) {
            return;
        }

        await this.whatsAppOutboundService.sendTextMessage({
            to: payload.businessWhatsapp,
            text: [
                `Alerta AquiTaDo: detectamos una resena negativa para ${payload.businessName}.`,
                `Resumen IA: ${payload.summary}`,
                `Resena: ${payload.reviewId}`,
            ].join('\n'),
        });
    }

    private async sendPublicLeadAlert(payload: PublicLeadAlertPayload): Promise<void> {
        const targetPhone = payload.businessWhatsapp || payload.ownerPhone;
        if (!targetPhone) {
            return;
        }

        const createdAt = new Date(payload.createdAt);
        const readableDate = Number.isNaN(createdAt.getTime())
            ? payload.createdAt
            : createdAt.toLocaleString('es-DO', { hour12: false });

        const messageLines = [
            `Nuevo lead web para ${payload.businessName}.`,
            `Contacto: ${payload.contactName} (${payload.contactPhone})`,
            payload.contactEmail ? `Email: ${payload.contactEmail}` : null,
            payload.preferredChannel ? `Canal preferido: ${payload.preferredChannel}` : null,
            `Lead: ${payload.leadId}`,
            `Hora: ${readableDate}`,
            `Mensaje: ${payload.message}`,
        ].filter((line): line is string => Boolean(line));

        const appPublicWebUrl = this.configService.get<string>('APP_PUBLIC_WEB_URL')?.trim();
        if (appPublicWebUrl) {
            messageLines.push(`Gestionalo en AquiTa.do: ${appPublicWebUrl.replace(/\/+$/, '')}/dashboard`);
        }

        await this.whatsAppOutboundService.sendTextMessage({
            to: targetPhone,
            text: messageLines.join('\n'),
        });
    }

    private isRedisUrlValid(value: string): boolean {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'redis:' || parsed.protocol === 'rediss:';
        } catch {
            return false;
        }
    }

    private async canReachRedis(redisUrl: string): Promise<boolean> {
        const probe = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableReadyCheck: true,
        });

        try {
            await probe.connect();
            const pong = await probe.ping();
            return pong === 'PONG';
        } catch (error) {
            this.logger.warn(
                `BullMQ Redis probe failed (${error instanceof Error ? error.message : String(error)})`,
            );
            return false;
        } finally {
            try {
                if (probe.status === 'ready' || probe.status === 'connect' || probe.status === 'connecting') {
                    await probe.quit();
                } else {
                    probe.disconnect();
                }
            } catch {
                probe.disconnect();
            }
        }
    }
}
