import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-businesses-contract.mjs
// Scope: GET /businesses params sent by BusinessesList against BusinessQueryDto.

const projectRoot = process.cwd();

const files = {
    businessesList: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'BusinessesList.tsx'),
    filtersHook: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'businesses-list', 'useBusinessesListFilters.ts'),
    businessDto: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'dto', 'business.dto.ts'),
    businessesController: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.controller.ts'),
    apiMain: path.join(projectRoot, 'apps', 'api', 'src', 'main.ts'),
};

const uiOnlyParams = new Set(['view', 'sort', 'map']);
const businessesAliasParams = new Set(['q', 'lat', 'lng']);

async function main() {
    const [
        businessesList,
        filtersHook,
        businessDto,
        businessesController,
        apiMain,
    ] = await Promise.all([
        readFile(files.businessesList),
        readFile(files.filtersHook),
        readFile(files.businessDto),
        readFile(files.businessesController),
        readFile(files.apiMain),
    ]);

    const allowedDtoParams = extractDtoProperties(businessDto, 'BusinessQueryDto');
    const sentParams = extractGetAllParamsFromBusinessesList(businessesList);
    const hookSearchParams = extractSearchParamKeys(filtersHook);
    const findings = [];
    const notes = [];

    if (!controllerFindAllUsesBusinessQueryDto(businessesController)) {
        findings.push('GET /businesses controller no longer appears to bind @Query() to BusinessQueryDto.');
    }

    if (!apiMain.includes('forbidNonWhitelisted: true')) {
        notes.push('Global ValidationPipe strict query enforcement was not detected in apps/api/src/main.ts.');
    }

    for (const paramName of sentParams) {
        if (!allowedDtoParams.has(paramName)) {
            findings.push(`BusinessesList sends "${paramName}" to businessApi.getAll, but BusinessQueryDto does not allow it.`);
        }
    }

    for (const paramName of uiOnlyParams) {
        if (sentParams.has(paramName)) {
            findings.push(`UI-only param "${paramName}" is being sent to GET /businesses.`);
        } else if (hookSearchParams.has(paramName)) {
            notes.push(`UI-only param "${paramName}" exists in URL state and is not sent to GET /businesses.`);
        }
    }

    for (const aliasName of businessesAliasParams) {
        if (sentParams.has(aliasName)) {
            findings.push(`Alias param "${aliasName}" is being sent to GET /businesses; this contract expects search/latitude/longitude.`);
        }
    }

    if (sentParams.has('search') && !sentParams.has('q')) {
        notes.push('Search naming is currently aligned for GET /businesses: sends "search", not "q".');
    }

    if ((sentParams.has('latitude') || sentParams.has('longitude')) && !sentParams.has('lat') && !sentParams.has('lng')) {
        notes.push('Geo naming is currently aligned for GET /businesses: sends "latitude"/"longitude", not "lat"/"lng".');
    }

    printReport({
        allowedDtoParams,
        sentParams,
        hookSearchParams,
        findings,
        notes,
    });
}

async function readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

function extractDtoProperties(content, className) {
    const classBlock = extractClassBlock(content, className);
    const propertyNames = new Set();
    const propertyPattern = /^\s+([A-Za-z_$][\w$]*)\??!?\s*:[^;\n]+;/gm;
    let match;

    while ((match = propertyPattern.exec(classBlock)) !== null) {
        propertyNames.add(match[1]);
    }

    return propertyNames;
}

function extractClassBlock(content, className) {
    const declaration = `export class ${className}`;
    const start = content.indexOf(declaration);
    if (start === -1) {
        return '';
    }

    const openBrace = content.indexOf('{', start);
    if (openBrace === -1) {
        return '';
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
            return content.slice(openBrace + 1, index);
        }
    }

    return '';
}

function extractGetAllParamsFromBusinessesList(content) {
    const getAllCall = content.match(/businessApi\.getAll\(\s*([^)]+?)\s*\)/);
    if (!getAllCall) {
        return new Set();
    }

    const getAllArgument = getAllCall[1].trim();
    if (getAllArgument !== 'params') {
        return new Set(extractObjectLiteralKeys(getAllArgument));
    }

    const paramNames = new Set();
    const declaration = content.match(/const\s+params[^=]*=\s*\{([\s\S]*?)\}\s*;/);
    if (declaration) {
        for (const key of extractObjectLiteralKeys(declaration[1])) {
            paramNames.add(key);
        }
    }

    const assignmentPattern = /\bparams\.([A-Za-z_$][\w$]*)\s*=/g;
    let match;
    while ((match = assignmentPattern.exec(content)) !== null) {
        paramNames.add(match[1]);
    }

    return paramNames;
}

function extractObjectLiteralKeys(source) {
    const keys = [];
    const keyPattern = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g;
    let match;
    while ((match = keyPattern.exec(source)) !== null) {
        keys.push(match[1]);
    }
    return keys;
}

function extractSearchParamKeys(content) {
    const keys = new Set();
    const searchParamPattern = /\b(?:searchParams|params)\.(?:get|set|delete)\(\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = searchParamPattern.exec(content)) !== null) {
        keys.add(match[1]);
    }

    return keys;
}

function controllerFindAllUsesBusinessQueryDto(content) {
    return /@Get\(\)[\s\S]*?async\s+findAll\([\s\S]*?@Query\(\)\s+query:\s*BusinessQueryDto/.test(content);
}

function printReport({ allowedDtoParams, sentParams, hookSearchParams, findings, notes }) {
    console.log('[businesses-contract-check] Report-only GET /businesses contract check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');
    console.log(`BusinessQueryDto params (${allowedDtoParams.size}): ${formatSet(allowedDtoParams)}`);
    console.log(`BusinessesList -> businessApi.getAll params (${sentParams.size}): ${formatSet(sentParams)}`);
    console.log(`URL/searchParams keys observed in filter hook (${hookSearchParams.size}): ${formatSet(hookSearchParams)}`);
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

function formatSet(value) {
    return [...value].sort((left, right) => left.localeCompare(right)).join(', ') || '(none)';
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

main().catch((error) => {
    console.error('[businesses-contract-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
