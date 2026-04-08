import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { RedisService } from '../cache/redis.service';
import { SearchService } from '../search/search.service';

type HealthPayload = {
    service: 'aquita-api';
    status: 'ok';
    timestamp: string;
    uptimeSeconds: number;
    checks?: {
        database: 'up';
        schema?: 'up';
        redis?: 'up' | 'down' | 'disabled';
        search?: 'up' | 'down' | 'disabled';
    };
    responseTimeMs?: number;
};

@Injectable()
export class HealthService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(SearchService)
        private readonly searchService: SearchService,
    ) { }

    getLiveness(): HealthPayload {
        return {
            service: 'aquita-api',
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
        };
    }

    async getReadiness(): Promise<HealthPayload> {
        const startedAt = Date.now();

        try {
            const [dbStatus] = await this.prisma.$queryRaw<Array<{
                ping: number;
                businesses: string | null;
                categories: string | null;
            }>>`
                SELECT
                    1 AS ping,
                    to_regclass('public.businesses')::text AS businesses,
                    to_regclass('public.categories')::text AS categories
            `;

            const schemaReady = Boolean(dbStatus?.businesses && dbStatus?.categories);
            if (!schemaReady) {
                throw new ServiceUnavailableException({
                    service: 'aquita-api',
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    checks: {
                        database: 'up',
                        schema: 'down',
                    },
                });
            }
            const [redisState, searchState] = await Promise.all([
                this.redisService.ping(),
                this.searchService.ping(),
            ]);
            const redis = redisState === null ? 'disabled' : redisState ? 'up' : 'down';
            const search = searchState === null ? 'disabled' : searchState ? 'up' : 'down';

            return {
                service: 'aquita-api',
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
                checks: {
                    database: 'up',
                    schema: 'up',
                    redis,
                    search,
                },
                responseTimeMs: Date.now() - startedAt,
            };
        } catch (error) {
            if (error instanceof ServiceUnavailableException) {
                throw error;
            }

            throw new ServiceUnavailableException({
                service: 'aquita-api',
                status: 'error',
                timestamp: new Date().toISOString(),
                checks: {
                    database: 'down',
                },
            });
        }
    }

    async getOperationalDashboard() {
        const startedAt = Date.now();
        const emailLatencyThresholdMs = this.resolveNumber('HEALTH_EMAIL_P95_MAX_MS', 4_000);
        const whatsappLatencyThresholdMs = this.resolveNumber('HEALTH_WHATSAPP_P95_MAX_MS', 3_000);
        const emailCritical = this.resolveBooleanLike('HEALTH_EMAIL_CRITICAL', false);
        const whatsappCritical = this.resolveBooleanLike('HEALTH_WHATSAPP_CRITICAL', false);
        const dbWarnThreshold = this.resolveNumber('HEALTH_DB_POOL_WARN_RATIO', 0.75);
        const dbCriticalThreshold = this.resolveNumber('HEALTH_DB_POOL_CRITICAL_RATIO', 0.9);
        const dependencyCriticalMinSamples = this.resolveNumber('HEALTH_DEPENDENCY_CRITICAL_MIN_SAMPLES', 3);
        const emailProviderConfigured = this.isTransactionalEmailConfigured();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [
            dbState,
            requestsLast24h,
            completionsLast24h,
            activeTokens,
            expiredPendingTokens,
        ] = await Promise.all([
            this.prisma.$queryRaw<Array<{
                ping: number;
                businesses: string | null;
                categories: string | null;
                active_connections: number;
                max_connections: number;
            }>>`
                SELECT
                    1 AS ping,
                    to_regclass('public.businesses')::text AS businesses,
                    to_regclass('public.categories')::text AS categories,
                    (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
                    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
            `.then((rows) => rows[0]),
            this.prisma.passwordResetToken.count({
                where: {
                    createdAt: {
                        gte: last24Hours,
                    },
                },
            }),
            this.prisma.passwordResetToken.count({
                where: {
                    usedAt: {
                        gte: last24Hours,
                    },
                },
            }),
            this.prisma.passwordResetToken.count({
                where: {
                    usedAt: null,
                    expiresAt: {
                        gte: now,
                    },
                },
            }),
            this.prisma.passwordResetToken.count({
                where: {
                    usedAt: null,
                    expiresAt: {
                        lt: now,
                    },
                },
            }),
        ]);

        const schemaReady = Boolean(dbState?.businesses && dbState?.categories);
        const activeConnections = Number(dbState?.active_connections ?? 0);
        const maxConnections = Math.max(Number(dbState?.max_connections ?? 1), 1);
        const dbPoolRatio = Number((activeConnections / maxConnections).toFixed(4));
        const dbPoolStatus = dbPoolRatio >= dbCriticalThreshold
            ? 'down'
            : dbPoolRatio >= dbWarnThreshold
                ? 'degraded'
                : 'up';

        const dependencySnapshots = this.observabilityService.getDependencyHealthSnapshot({
            email: emailLatencyThresholdMs,
            whatsapp: whatsappLatencyThresholdMs,
        });

        const emailDependencies = dependencySnapshots.filter((entry) => entry.dependency === 'email');
        const whatsappDependencies = dependencySnapshots.filter((entry) => entry.dependency === 'whatsapp');

        const emailHealth = emailProviderConfigured
            ? this.summarizeDependencyGroup(
                emailDependencies,
                emailLatencyThresholdMs,
                dependencyCriticalMinSamples,
                emailCritical,
            )
            : {
                status: 'down' as const,
                reason: 'not_configured',
                critical: emailCritical,
                thresholdMs: emailLatencyThresholdMs,
                operations: [],
            };
        const whatsappHealth = this.summarizeDependencyGroup(
            whatsappDependencies,
            whatsappLatencyThresholdMs,
            dependencyCriticalMinSamples,
            whatsappCritical,
        );

        const overallStatus = !schemaReady
            || dbPoolStatus === 'down'
            || (emailHealth.critical && emailHealth.status === 'down')
            || (whatsappHealth.critical && whatsappHealth.status === 'down')
            ? 'down'
            : dbPoolStatus === 'degraded'
                || emailHealth.status === 'down'
                || whatsappHealth.status === 'degraded'
                || whatsappHealth.status === 'down'
                || emailHealth.status !== 'up'
                ? 'degraded'
                : 'up';

        return {
            service: 'aquita-api',
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            responseTimeMs: Date.now() - startedAt,
            checks: {
                database: {
                    status: schemaReady ? 'up' : 'down',
                    schema: schemaReady ? 'up' : 'down',
                    pool: {
                        status: dbPoolStatus,
                        activeConnections,
                        maxConnections,
                        saturationPct: Number((dbPoolRatio * 100).toFixed(2)),
                    },
                },
                email: emailHealth,
                whatsapp: whatsappHealth,
            },
            passwordReset: {
                providerConfigured: emailProviderConfigured,
                requestsLast24h,
                completionsLast24h,
                completionRatePct: requestsLast24h > 0
                    ? Number(((completionsLast24h / requestsLast24h) * 100).toFixed(2))
                    : 0,
                activeTokens,
                expiredPendingTokens,
            },
        };
    }

    private summarizeDependencyGroup(
        items: Array<{
            operation: string;
            samples: number;
            p95Ms: number;
            errorRatePct: number;
            healthy: boolean;
            lastSeenAt: string | null;
            latencyThresholdMs: number;
        }>,
        thresholdMs: number,
        minimumCriticalSamples: number,
        critical: boolean,
    ) {
        if (items.length === 0) {
            return {
                status: 'degraded',
                reason: 'no_samples',
                critical,
                thresholdMs,
                operations: [],
            };
        }

        const hasDown = items.some(
            (item) => !item.healthy && item.errorRatePct >= 20 && item.samples >= minimumCriticalSamples,
        );
        const hasDegraded = items.some((item) => !item.healthy);

        return {
            status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'up',
            critical,
            thresholdMs,
            operations: items.map((item) => ({
                operation: item.operation,
                samples: item.samples,
                p95Ms: item.p95Ms,
                errorRatePct: item.errorRatePct,
                lastSeenAt: item.lastSeenAt,
                latencyThresholdMs: item.latencyThresholdMs,
                healthy: item.healthy,
            })),
        };
    }

    private resolveNumber(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        if (!raw) {
            return fallback;
        }

        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    private resolveBooleanLike(key: string, fallback: boolean): boolean {
        const raw = this.configService.get<string>(key);
        if (!raw) {
            return fallback;
        }

        const normalized = raw.trim().toLowerCase();
        if (normalized === '1' || normalized === 'true') {
            return true;
        }
        if (normalized === '0' || normalized === 'false') {
            return false;
        }
        return fallback;
    }

    private isTransactionalEmailConfigured(): boolean {
        const resendApiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
        const resendFromEmail = this.configService.get<string>('RESEND_FROM_EMAIL')?.trim();
        return Boolean(resendApiKey && resendFromEmail);
    }
}
