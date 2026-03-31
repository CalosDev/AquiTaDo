import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const TARGETS = [
    'README.md',
    'docs',
    'apps/web/src',
    'apps/api/src',
];
const INCLUDED_EXTENSIONS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.json']);
const SUSPECT_PATTERNS = [
    { label: 'UTF-8 mojibake', regex: /\u00C3./g },
    { label: 'Latin-1 stray prefix', regex: /\u00C2./g },
    { label: 'Broken punctuation', regex: /\u00E2\u20AC\u00A2|\u00E2\u20AC|\u00E2\u20AC\u201C|\u00E2\u20AC\u201D/g },
    { label: 'Replacement character', regex: /\uFFFD/g },
];

async function walk(entryPath, results) {
    const absolutePath = path.join(ROOT_DIR, entryPath);
    const entryStat = await stat(absolutePath);

    if (entryStat.isDirectory()) {
        const children = await readdir(absolutePath, { withFileTypes: true });
        for (const child of children) {
            await walk(path.join(entryPath, child.name), results);
        }
        return;
    }

    if (!INCLUDED_EXTENSIONS.has(path.extname(entryPath))) {
        return;
    }

    const content = await readFile(absolutePath, 'utf8');
    const matches = SUSPECT_PATTERNS.flatMap((pattern) => {
        const found = [...content.matchAll(pattern.regex)];
        return found.map((match) => ({
            label: pattern.label,
            snippet: match[0],
            index: match.index ?? 0,
        }));
    });

    if (matches.length === 0) {
        return;
    }

    const lines = content.split(/\r?\n/);
    for (const match of matches.slice(0, 20)) {
        let consumed = 0;
        let lineNumber = 1;
        for (const line of lines) {
            const nextConsumed = consumed + line.length + 1;
            if (match.index < nextConsumed) {
                results.push({
                    entryPath,
                    lineNumber,
                    label: match.label,
                    snippet: line.trim().slice(0, 160),
                });
                break;
            }
            consumed = nextConsumed;
            lineNumber += 1;
        }
    }
}

async function main() {
    const issues = [];

    for (const target of TARGETS) {
        await walk(target, issues);
    }

    if (issues.length === 0) {
        console.log('Encoding check passed: no suspicious mojibake patterns found.');
        return;
    }

    console.error('Encoding check failed. Suspicious text patterns detected:\n');
    for (const issue of issues) {
        console.error(`- ${issue.entryPath}:${issue.lineNumber} [${issue.label}] ${issue.snippet}`);
    }
    process.exitCode = 1;
}

await main();
