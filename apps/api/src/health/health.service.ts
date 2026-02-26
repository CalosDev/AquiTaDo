import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    constructor(private readonly prisma: PrismaService) { }

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
}
