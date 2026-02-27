import { PrismaPg } from '@prisma/adapter-pg';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { RequestContextService } from '../core/request-context/request-context.service';

const SOFT_DELETE_MODELS = new Set<string>([
    'Business',
    'Promotion',
    'Booking',
    'Conversation',
]);

const AUDITABLE_OPERATIONS = new Set<string>([
    'create',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
]);

function toDelegateName(model: string): string {
    return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return value as Record<string, unknown>;
}

function withNotDeleted(where: unknown): Record<string, unknown> {
    const normalized = asRecord(where);
    if (Object.prototype.hasOwnProperty.call(normalized, 'deletedAt')) {
        return normalized;
    }

    if (Object.keys(normalized).length === 0) {
        return { deletedAt: null };
    }

    return {
        AND: [normalized, { deletedAt: null }],
    };
}

function toJsonSafe(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((entry) => toJsonSafe(entry));
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value === 'object') {
        const normalized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            normalized[key] = toJsonSafe(entry);
        }
        return normalized;
    }

    return value;
}

function extractString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly rawClient: PrismaClient;
    private readonly client: PrismaClient;

    constructor(
        @Inject(RequestContextService)
        private readonly requestContextService: RequestContextService,
    ) {
        const connectionString = process.env['DATABASE_URL'];
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is required');
        }

        const adapter = new PrismaPg({ connectionString });
        this.rawClient = new PrismaClient({ adapter });

        const rawClient = this.rawClient;
        const writeAuditLog = this.writeAuditLog.bind(this);

        const applyReadFilter = (model: string | undefined, args: unknown): Record<string, unknown> => {
            if (!model || !SOFT_DELETE_MODELS.has(model)) {
                return asRecord(args);
            }

            const normalizedArgs = asRecord(args);
            return {
                ...normalizedArgs,
                where: withNotDeleted(normalizedArgs.where),
            };
        };

        const isSoftDeletedResult = (model: string | undefined, result: unknown): boolean => {
            if (!model || !SOFT_DELETE_MODELS.has(model)) {
                return false;
            }

            const normalized = asRecord(result);
            if (!Object.prototype.hasOwnProperty.call(normalized, 'deletedAt')) {
                return false;
            }

            return normalized['deletedAt'] !== null && normalized['deletedAt'] !== undefined;
        };

        const resolveModelDelegate = (model: string | undefined) => {
            if (!model) {
                return null;
            }

            const delegateName = toDelegateName(model);
            return (rawClient as Record<string, any>)[delegateName] as
                | Record<string, (...params: unknown[]) => Promise<unknown>>
                | null;
        };

        const maybeAuditLog = async (
            model: string | undefined,
            operation: string,
            args: unknown,
            result: unknown,
        ): Promise<void> => {
            if (!model || model === 'AuditLog' || !AUDITABLE_OPERATIONS.has(operation)) {
                return;
            }

            await writeAuditLog(model, operation, asRecord(args), result);
        };

        this.client = rawClient.$extends({
            name: 'core-soft-delete-audit-extension',
            query: {
                $allModels: {
                    async findUnique({ model, args, query }) {
                        const result = await query(args);
                        if (isSoftDeletedResult(model, result)) {
                            return null;
                        }

                        return result;
                    },
                    async findUniqueOrThrow({ model, args, query }) {
                        const result = await query(args);
                        if (isSoftDeletedResult(model, result)) {
                            throw new Error('Record not found');
                        }

                        return result;
                    },
                    async findFirst({ model, args, query }) {
                        return query(applyReadFilter(model, args));
                    },
                    async findMany({ model, args, query }) {
                        return query(applyReadFilter(model, args));
                    },
                    async count({ model, args, query }) {
                        return query(applyReadFilter(model, args));
                    },
                    async aggregate({ model, args, query }) {
                        return query(applyReadFilter(model, args));
                    },
                    async groupBy({ model, args, query }) {
                        return query(applyReadFilter(model, args) as typeof args);
                    },
                    async create({ model, args, query }) {
                        const result = await query(args);
                        await maybeAuditLog(model, 'create', args, result);
                        return result;
                    },
                    async update({ model, args, query }) {
                        const result = await query(args);
                        await maybeAuditLog(model, 'update', args, result);
                        return result;
                    },
                    async updateMany({ model, args, query }) {
                        const result = await query(args);
                        await maybeAuditLog(model, 'updateMany', args, result);
                        return result;
                    },
                    async upsert({ model, args, query }) {
                        const result = await query(args);
                        await maybeAuditLog(model, 'upsert', args, result);
                        return result;
                    },
                    async delete({ model, args, query }) {
                        if (!model || !SOFT_DELETE_MODELS.has(model)) {
                            const hardDeleted = await query(args);
                            await maybeAuditLog(model, 'delete', args, hardDeleted);
                            return hardDeleted;
                        }

                        const delegate = resolveModelDelegate(model);
                        if (!delegate?.update) {
                            const hardDeleted = await query(args);
                            await maybeAuditLog(model, 'delete', args, hardDeleted);
                            return hardDeleted;
                        }

                        const normalizedArgs = asRecord(args);
                        const softDeleted = await delegate.update({
                            where: normalizedArgs.where,
                            data: { deletedAt: new Date() },
                        });
                        await maybeAuditLog(model, 'delete', args, softDeleted);
                        return softDeleted;
                    },
                    async deleteMany({ model, args, query }) {
                        const result = await query(args);
                        await maybeAuditLog(model, 'deleteMany', args, result);
                        return result;
                    },
                },
            },
        }) as unknown as PrismaClient;

        return new Proxy(this, {
            get(target, property, receiver) {
                if (property in target) {
                    const targetValue = Reflect.get(target, property, receiver);
                    if (typeof targetValue === 'function') {
                        return targetValue.bind(target);
                    }
                    return targetValue;
                }

                const clientValue = Reflect.get(target.client as unknown as object, property);
                if (typeof clientValue === 'function') {
                    return clientValue.bind(target.client);
                }
                return clientValue;
            },
        });
    }

    async onModuleInit() {
        await this.client.$connect();
    }

    async onModuleDestroy() {
        await this.client.$disconnect();
    }

    private async writeAuditLog(
        modelName: string,
        operation: string,
        args: Record<string, unknown>,
        result: unknown,
    ): Promise<void> {
        try {
            const requestContext = this.requestContextService.get();
            const resultRecord = asRecord(result);
            const whereRecord = asRecord(args.where);
            const dataRecord = asRecord(args.data);

            const organizationId = extractString(requestContext?.organizationId)
                ?? extractString(resultRecord.organizationId)
                ?? extractString(whereRecord.organizationId)
                ?? extractString(dataRecord.organizationId)
                ?? null;

            const actorUserId = extractString(requestContext?.userId) ?? null;
            const targetId = extractString(resultRecord.id)
                ?? extractString(whereRecord.id)
                ?? null;

            await this.rawClient.auditLog.create({
                data: {
                    organizationId,
                    actorUserId,
                    action: `prisma.${modelName}.${operation}`,
                    targetType: modelName.toLowerCase(),
                    targetId,
                    metadata: {
                        requestId: requestContext?.requestId ?? null,
                        method: requestContext?.method ?? null,
                        path: requestContext?.path ?? null,
                        operation,
                        model: modelName,
                        where: toJsonSafe(whereRecord),
                        data: toJsonSafe(dataRecord),
                    } as Prisma.InputJsonValue,
                },
            });
        } catch {
            // Audit logging should never block domain operations.
        }
    }
}

export interface PrismaService extends PrismaClient { }
