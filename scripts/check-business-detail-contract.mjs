import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-business-detail-contract.mjs
// Scope: GET /businesses/:identifier public detail route and frontend wrappers.

const projectRoot = process.cwd();

const files = {
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    businessesController: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.controller.ts'),
};

async function main() {
    const [endpoints, businessesController] = await Promise.all([
        readFile(files.endpoints),
        readFile(files.businessesController),
    ]);

    const wrapperChecks = inspectFrontendWrappers(endpoints);
    const prefetchChecks = inspectPrefetchPublicDetail(endpoints);
    const controllerChecks = inspectControllerDetailRoute(businessesController);
    const findings = [];
    const notes = [];

    if (!wrapperChecks.getByIdentifier) {
        findings.push('businessApi.getByIdentifier does not appear to call /businesses/${identifier}.');
    }

    if (!wrapperChecks.getById) {
        findings.push('businessApi.getById does not appear to call /businesses/${id}.');
    }

    if (!wrapperChecks.getBySlug) {
        findings.push('businessApi.getBySlug does not appear to call /businesses/${slug}.');
    }

    if (!prefetchChecks.exists) {
        findings.push('businessApi.prefetchPublicDetail could not be found.');
    } else {
        if (!prefetchChecks.prefersSlug) {
            findings.push('prefetchPublicDetail does not appear to prefer slug before id.');
        }
        if (!prefetchChecks.usesIdFallbackAfterSlugFailure) {
            findings.push('prefetchPublicDetail does not appear to fall back from slug to id after slug prefetch failure.');
        }
        if (!prefetchChecks.prefetchesIdWhenSlugMissing) {
            findings.push('prefetchPublicDetail does not appear to prefetch id when slug is missing.');
        }
    }

    if (!controllerChecks.hasIdentifierRoute) {
        findings.push('businesses.controller.ts does not expose @Get(":identifier").');
    }

    if (!controllerChecks.hasFindByIdentifierHandler) {
        findings.push('businesses.controller.ts does not expose a findByIdentifier handler for public detail.');
    }

    if (!controllerChecks.usesIdentifierParam) {
        findings.push('findByIdentifier does not appear to use @Param("identifier").');
    }

    if (!controllerChecks.usesOptionalJwtGuard) {
        findings.push('findByIdentifier does not appear to use OptionalJwtAuthGuard.');
    }

    if (!controllerChecks.usesOptionalOrgContextGuard) {
        findings.push('findByIdentifier does not appear to use OptionalOrgContextGuard.');
    }

    if (controllerChecks.usesMandatoryJwtGuard) {
        findings.push('findByIdentifier appears to use mandatory JwtAuthGuard; public detail should remain optional-auth.');
    }

    if (controllerChecks.usesRolesGuard || controllerChecks.usesRolesDecorator) {
        findings.push('findByIdentifier appears to use RolesGuard or @Roles; public detail should not require a role.');
    }

    if (wrapperChecks.getByIdentifier && wrapperChecks.getById && wrapperChecks.getBySlug) {
        notes.push('Frontend wrappers currently point to /businesses/${identifier}, /businesses/${id}, and /businesses/${slug}.');
    }

    if (
        prefetchChecks.exists
        && prefetchChecks.prefersSlug
        && prefetchChecks.usesIdFallbackAfterSlugFailure
        && prefetchChecks.prefetchesIdWhenSlugMissing
    ) {
        notes.push('prefetchPublicDetail currently prefers slug and uses id as fallback.');
    }

    if (
        controllerChecks.hasIdentifierRoute
        && controllerChecks.usesIdentifierParam
        && controllerChecks.usesOptionalJwtGuard
        && controllerChecks.usesOptionalOrgContextGuard
        && !controllerChecks.usesMandatoryJwtGuard
        && !controllerChecks.usesRolesGuard
        && !controllerChecks.usesRolesDecorator
    ) {
        notes.push('Public detail route currently remains optional-auth and does not require a role.');
    }

    printReport({
        wrapperChecks,
        prefetchChecks,
        controllerChecks,
        findings,
        notes,
    });
}

async function readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

function inspectFrontendWrappers(content) {
    return {
        getByIdentifier: hasFunctionBlockPattern(
            content,
            'getByIdentifier',
            /api\.get\(\s*`\/businesses\/\$\{identifier\}`\s*\)/,
        ),
        getById: hasFunctionBlockPattern(
            content,
            'getById',
            /api\.get\(\s*`\/businesses\/\$\{id\}`\s*\)/,
        ),
        getBySlug: hasFunctionBlockPattern(
            content,
            'getBySlug',
            /api\.get\(\s*`\/businesses\/\$\{slug\}`\s*\)/,
        ),
    };
}

function inspectPrefetchPublicDetail(content) {
    const block = extractObjectMethodBlock(content, 'prefetchPublicDetail');
    if (!block) {
        return {
            exists: false,
            prefersSlug: false,
            usesIdFallbackAfterSlugFailure: false,
            prefetchesIdWhenSlugMissing: false,
        };
    }

    const slugBranchIndex = block.indexOf('if (slug)');
    const idBranchIndex = block.indexOf('if (id)');

    return {
        exists: true,
        prefersSlug: slugBranchIndex !== -1 && idBranchIndex !== -1 && slugBranchIndex < idBranchIndex,
        usesIdFallbackAfterSlugFailure: /getBySlug\(slug\)\.catch\([\s\S]*?if\s*\(id\)[\s\S]*?getByIdentifier\(id\)/.test(block),
        prefetchesIdWhenSlugMissing: /if\s*\(id\)\s*\{[\s\S]*?getByIdentifier\(id\)/.test(block),
    };
}

function inspectControllerDetailRoute(content) {
    const handlerBlock = extractMethodWithDecoratorsBlock(content, 'findByIdentifier');
    return {
        hasIdentifierRoute: /@Get\(\s*['"]:identifier['"]\s*\)/.test(handlerBlock),
        hasFindByIdentifierHandler: handlerBlock.includes('async findByIdentifier'),
        usesIdentifierParam: /@Param\(\s*['"]identifier['"]\s*\)\s+identifier\s*:\s*string/.test(handlerBlock),
        usesOptionalJwtGuard: /\bOptionalJwtAuthGuard\b/.test(handlerBlock),
        usesOptionalOrgContextGuard: /\bOptionalOrgContextGuard\b/.test(handlerBlock),
        usesMandatoryJwtGuard: /(?<!Optional)\bJwtAuthGuard\b/.test(handlerBlock),
        usesRolesGuard: /\bRolesGuard\b/.test(handlerBlock),
        usesRolesDecorator: /@Roles\s*\(/.test(handlerBlock),
    };
}

function hasFunctionBlockPattern(content, propertyName, pattern) {
    const block = extractObjectMethodBlock(content, propertyName);
    return pattern.test(block);
}

function extractObjectMethodBlock(content, propertyName) {
    const propertyPattern = new RegExp(`${escapeRegExp(propertyName)}\\s*:\\s*`);
    const propertyMatch = propertyPattern.exec(content);
    if (!propertyMatch) {
        return '';
    }

    const start = propertyMatch.index;
    const nextProperty = /\n\s{4}[A-Za-z_$][\w$]*\s*:/g;
    nextProperty.lastIndex = propertyMatch.index + propertyMatch[0].length;
    let match;

    while ((match = nextProperty.exec(content)) !== null) {
        if (match.index > start) {
            return content.slice(start, match.index);
        }
    }

    return content.slice(start);
}

function extractMethodWithDecoratorsBlock(content, methodName) {
    const methodIndex = content.indexOf(`async ${methodName}`);
    if (methodIndex === -1) {
        return '';
    }

    const previousRouteDecorator = content.lastIndexOf('@Get(', methodIndex);
    const start = previousRouteDecorator === -1 ? methodIndex : previousRouteDecorator;
    const openBrace = content.indexOf('{', methodIndex);
    if (openBrace === -1) {
        return content.slice(start, methodIndex);
    }

    let depth = 0;
    for (let index = openBrace; index < content.length; index += 1) {
        const char = content[index];
        if (char === '{') {
            depth += 1;
        }
        if (char === '}') {
            depth -= 1;
        }
        if (depth === 0) {
            return content.slice(start, index + 1);
        }
    }

    return content.slice(start);
}

function printReport({
    wrapperChecks,
    prefetchChecks,
    controllerChecks,
    findings,
    notes,
}) {
    console.log('[business-detail-contract-check] Report-only GET /businesses/:identifier contract check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');
    console.log('Frontend wrappers:');
    console.log(`- getByIdentifier -> /businesses/\${identifier}: ${formatBoolean(wrapperChecks.getByIdentifier)}`);
    console.log(`- getById -> /businesses/\${id}: ${formatBoolean(wrapperChecks.getById)}`);
    console.log(`- getBySlug -> /businesses/\${slug}: ${formatBoolean(wrapperChecks.getBySlug)}`);
    console.log('');
    console.log('Prefetch behavior:');
    console.log(`- prefetchPublicDetail exists: ${formatBoolean(prefetchChecks.exists)}`);
    console.log(`- prefers slug before id: ${formatBoolean(prefetchChecks.prefersSlug)}`);
    console.log(`- falls back from slug to id: ${formatBoolean(prefetchChecks.usesIdFallbackAfterSlugFailure)}`);
    console.log(`- prefetches id when slug is missing: ${formatBoolean(prefetchChecks.prefetchesIdWhenSlugMissing)}`);
    console.log('');
    console.log('Backend route:');
    console.log(`- @Get(":identifier"): ${formatBoolean(controllerChecks.hasIdentifierRoute)}`);
    console.log(`- findByIdentifier handler: ${formatBoolean(controllerChecks.hasFindByIdentifierHandler)}`);
    console.log(`- @Param("identifier"): ${formatBoolean(controllerChecks.usesIdentifierParam)}`);
    console.log(`- OptionalJwtAuthGuard: ${formatBoolean(controllerChecks.usesOptionalJwtGuard)}`);
    console.log(`- OptionalOrgContextGuard: ${formatBoolean(controllerChecks.usesOptionalOrgContextGuard)}`);
    console.log(`- mandatory JwtAuthGuard: ${formatBoolean(controllerChecks.usesMandatoryJwtGuard)}`);
    console.log(`- RolesGuard: ${formatBoolean(controllerChecks.usesRolesGuard)}`);
    console.log(`- @Roles: ${formatBoolean(controllerChecks.usesRolesDecorator)}`);
    console.log('');

    if (findings.length > 0) {
        console.log(`Findings (${findings.length}):`);
        for (const finding of findings) {
            console.log(`- ${finding}`);
        }
    } else {
        console.log('Findings: none');
    }

    if (notes.length > 0) {
        console.log('');
        console.log('Notes:');
        for (const note of notes) {
            console.log(`- ${note}`);
        }
    }

    console.log('');
    console.log('Report-only mode: this script exits 0 and is not wired into CI.');
}

function formatBoolean(value) {
    return value ? 'yes' : 'no';
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
    console.error('[business-detail-contract-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
