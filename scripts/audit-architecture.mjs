import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const apiSrcRoot = path.join(projectRoot, 'apps', 'api', 'src');

const envAllowList = new Set([
    normalizePath(path.join(apiSrcRoot, 'main.ts')),
    normalizePath(path.join(apiSrcRoot, 'start-prod.ts')),
    normalizePath(path.join(apiSrcRoot, 'bootstrap', 'migrate-on-start.ts')),
    normalizePath(path.join(apiSrcRoot, 'prisma', 'prisma.service.ts')),
    normalizePath(path.join(apiSrcRoot, 'config', 'env.validation.ts')),
]);

const envAllowMatchers = [
    (filePath) => envAllowList.has(filePath),
    (filePath) => filePath.endsWith('.spec.ts'),
];

const forbiddenTrackedMatchers = [
    (file) => file === 'dist' || file.startsWith('dist/') || file.includes('/dist/'),
    (file) => file === 'coverage' || file.startsWith('coverage/') || file.includes('/coverage/'),
    (file) => file.startsWith('uploads/') || file.startsWith('apps/api/uploads/'),
    (file) => file.includes('/src/generated/prisma/'),
];

async function main() {
    const violations = [];

    await scanForDirectProcessEnv(apiSrcRoot, violations);
    scanForTrackedBuildArtifacts(violations);

    if (violations.length > 0) {
        console.error('\n[architecture-audit] Violations found:\n');
        for (const violation of violations) {
            console.error(`- ${violation}`);
        }
        console.error('\nFix the issues above to keep the project structure clean.\n');
        process.exit(1);
    }

    console.log('[architecture-audit] OK');
}

async function scanForDirectProcessEnv(dir, violations) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await scanForDirectProcessEnv(absolutePath, violations);
            continue;
        }

        if (!entry.isFile() || !absolutePath.endsWith('.ts')) {
            continue;
        }

        const normalized = normalizePath(absolutePath);
        if (envAllowMatchers.some((matches) => matches(normalized))) {
            continue;
        }

        const content = await fs.readFile(absolutePath, 'utf8');
        if (!content.includes('process.env')) {
            continue;
        }

        const lineNumbers = findLineNumbers(content, /process\.env/g);
        const relativePath = normalizePath(path.relative(projectRoot, absolutePath));
        violations.push(`${relativePath}:${lineNumbers.join(',')} uses process.env directly (use ConfigService).`);
    }
}

function scanForTrackedBuildArtifacts(violations) {
    const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
        .split('\n')
        .map((line) => normalizePath(line.trim()))
        .filter(Boolean);

    for (const file of trackedFiles) {
        for (const matchesForbidden of forbiddenTrackedMatchers) {
            if (matchesForbidden(file)) {
                violations.push(`${file} is a tracked build/generated artifact.`);
            }
        }
    }
}

function findLineNumbers(content, regex) {
    const lines = content.split(/\r?\n/);
    const results = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (regex.test(lines[i])) {
            results.push(i + 1);
        }
        regex.lastIndex = 0;
    }
    return results;
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

main().catch((error) => {
    console.error('[architecture-audit] Unexpected error:', error);
    process.exit(1);
});
