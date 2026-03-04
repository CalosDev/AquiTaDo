import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiEmbeddingsService } from '../src/ai/ai-embeddings.service';
import { AiProviderService } from '../src/ai/ai-provider.service';

type ReindexTarget = {
    id: string;
    name: string;
    organizationId: string;
};

function resolveOptionalPositiveInteger(raw: string | undefined): number | undefined {
    if (!raw) {
        return undefined;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('AI_REINDEX_LIMIT must be a positive integer');
    }

    return parsed;
}

async function main(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });

    try {
        const prisma = app.get(PrismaService);
        const aiEmbeddingsService = app.get(AiEmbeddingsService);
        const aiProviderService = app.get(AiProviderService);

        const provider = aiProviderService.getProviderName();
        if (provider === 'local-fallback') {
            throw new Error(
                'AI provider is local-fallback. Configure AI_PROVIDER=gemini with GEMINI_API_KEY before reindexing.',
            );
        }

        const limit = resolveOptionalPositiveInteger(process.env.AI_REINDEX_LIMIT);
        const organizationId = process.env.AI_REINDEX_ORGANIZATION_ID?.trim() || undefined;
        const dryRun = String(process.env.AI_REINDEX_DRY_RUN ?? 'false').trim().toLowerCase() === 'true';

        const targets = await prisma.business.findMany({
            where: {
                verified: true,
                deletedAt: null,
                ...(organizationId ? { organizationId } : {}),
            },
            select: {
                id: true,
                name: true,
                organizationId: true,
            },
            orderBy: {
                updatedAt: 'desc',
            },
            ...(limit ? { take: limit } : {}),
        }) as ReindexTarget[];

        console.log(
            JSON.stringify({
                event: 'ai-reindex-start',
                provider,
                totalTargets: targets.length,
                organizationId: organizationId ?? null,
                limit: limit ?? null,
                dryRun,
            }),
        );

        if (dryRun) {
            console.log(JSON.stringify({ event: 'ai-reindex-dry-run-complete', totalTargets: targets.length }));
            return;
        }

        let indexed = 0;
        let failed = 0;
        const failures: Array<{ businessId: string; reason: string }> = [];

        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index];
            try {
                await aiEmbeddingsService.upsertBusinessEmbedding(target.id);
                indexed += 1;

                if ((index + 1) % 10 === 0 || index === targets.length - 1) {
                    console.log(
                        JSON.stringify({
                            event: 'ai-reindex-progress',
                            processed: index + 1,
                            total: targets.length,
                            indexed,
                            failed,
                        }),
                    );
                }
            } catch (error) {
                failed += 1;
                failures.push({
                    businessId: target.id,
                    reason: error instanceof Error ? error.message : String(error),
                });
                console.error(
                    JSON.stringify({
                        event: 'ai-reindex-failed-item',
                        businessId: target.id,
                        businessName: target.name,
                        reason: failures[failures.length - 1]?.reason ?? 'unknown',
                    }),
                );
            }
        }

        console.log(
            JSON.stringify({
                event: 'ai-reindex-finish',
                provider,
                totalTargets: targets.length,
                indexed,
                failed,
                failures: failures.slice(0, 20),
            }),
        );
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
