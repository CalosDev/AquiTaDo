import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type HealthPayload = {
    service: 'aquita-api';
    status: 'ok';
    timestamp: string;
    uptimeSeconds: number;
    checks?: {
        database: 'up';
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
            await this.prisma.$queryRaw`SELECT 1`;

            return {
                service: 'aquita-api',
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.floor(process.uptime()),
                checks: {
                    database: 'up',
                },
                responseTimeMs: Date.now() - startedAt,
            };
        } catch {
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

