import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.e2e.spec.ts'],
        fileParallelism: false,
        hookTimeout: 60_000,
        testTimeout: 60_000,
    },
});

