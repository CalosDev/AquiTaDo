import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';

type HealthPayload = {
    service: 'aquita-api';
    status: 'ok';
    timestamp: string;
    uptimeSeconds: number;
    checks?: {
        database: 'up';
        schema?: 'up';
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

            return {
                service: 'aquita-api',
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
                checks: {
                    database: 'up',
                    schema: 'up',
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
        const aiLatencyThresholdMs = this.resolveNumber('HEALTH_AI_P95_MAX_MS', 2_500);
        const whatsappLatencyThresholdMs = this.resolveNumber('HEALTH_WHATSAPP_P95_MAX_MS', 3_000);
        const dbWarnThreshold = this.resolveNumber('HEALTH_DB_POOL_WARN_RATIO', 0.75);
        const dbCriticalThreshold = this.resolveNumber('HEALTH_DB_POOL_CRITICAL_RATIO', 0.9);

        const [dbState] = await this.prisma.$queryRaw<Array<{
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
        `;

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
            ai: aiLatencyThresholdMs,
            whatsapp: whatsappLatencyThresholdMs,
        });

        const aiDependencies = dependencySnapshots.filter((entry) => entry.dependency === 'ai');
        const whatsappDependencies = dependencySnapshots.filter((entry) => entry.dependency === 'whatsapp');

        const aiHealth = this.summarizeDependencyGroup(aiDependencies, aiLatencyThresholdMs);
        const whatsappHealth = this.summarizeDependencyGroup(whatsappDependencies, whatsappLatencyThresholdMs);

        const overallStatus = !schemaReady || dbPoolStatus === 'down' || aiHealth.status === 'down' || whatsappHealth.status === 'down'
            ? 'down'
            : dbPoolStatus === 'degraded' || aiHealth.status === 'degraded' || whatsappHealth.status === 'degraded'
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
                ai: aiHealth,
                whatsapp: whatsappHealth,
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
    ) {
        if (items.length === 0) {
            return {
                status: 'degraded',
                reason: 'no_samples',
                thresholdMs,
                operations: [],
            };
        }

        const hasDown = items.some((item) => !item.healthy && item.errorRatePct >= 20);
        const hasDegraded = items.some((item) => !item.healthy);

        return {
            status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'up',
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
}
