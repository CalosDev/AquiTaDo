const path = require('node:path');

const chromeProfileDir = path
    .join(process.cwd(), 'output', 'lighthouse', 'chrome-profile')
    .replace(/\\/g, '/');
const chromeCacheDir = path
    .join(chromeProfileDir, 'cache')
    .replace(/\\/g, '/');

module.exports = {
    ci: {
        collect: {
            numberOfRuns: 1,
            url: [
                'http://127.0.0.1:4173/',
                'http://127.0.0.1:4173/login',
                'http://127.0.0.1:4173/businesses',
            ],
            settings: {
                preset: 'desktop',
                chromeFlags: `--user-data-dir=${chromeProfileDir} --disk-cache-dir=${chromeCacheDir} --disable-dev-shm-usage`,
            },
        },
        assert: {
            assertions: {
                'categories:performance': [
                    'warn',
                    {
                        minScore: 0.8,
                    },
                ],
                'categories:accessibility': [
                    'error',
                    {
                        minScore: 0.9,
                    },
                ],
                'categories:best-practices': [
                    'error',
                    {
                        minScore: 0.9,
                    },
                ],
                'installable-manifest': 'error',
                'service-worker': 'warn',
            },
        },
        upload: {
            target: 'filesystem',
            outputDir: 'output/lighthouse',
        },
    },
};
