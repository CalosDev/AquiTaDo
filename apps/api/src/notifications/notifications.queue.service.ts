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

type NotificationPayload =
    | BookingReminderPayload
    | PromotionGeoAlertPayload
    | VerificationAlertPayload
    | NegativeReviewAlertPayload;

const JOB_NAME_BOOKING_REMINDER = 'whatsapp.booking.reminder';
const JOB_NAME_PROMOTION_GEO = 'whatsapp.promotion.geo';
const JOB_NAME_ACCOUNT_VERIFICATION = 'whatsapp.account.verification';
const JOB_NAME_NEGATIVE_REVIEW = 'whatsapp.review.negative';

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
}
