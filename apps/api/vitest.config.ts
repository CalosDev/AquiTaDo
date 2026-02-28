import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        fileParallelism: false,
        hookTimeout: 30_000,
        testTimeout: 30_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
        },
    },
});
