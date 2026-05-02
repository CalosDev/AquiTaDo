import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-businesses-response-shape.mjs
// Scope: GET /businesses response shape expected by BusinessesList against backend producer.

const projectRoot = process.cwd();

const files = {
    riskMap: path.join(projectRoot, 'docs', 'API_RESPONSE_SHAPE_RISK_MAP.md'),
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    businessesList: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'BusinessesList.tsx'),
    businessesController: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.controller.ts'),
    businessesService: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.service.ts'),
    searchService: path.join(projectRoot, 'apps', 'api', 'src', 'search', 'search.service.ts'),
    jsonApiResponseInterceptor: path.join(projectRoot, 'apps', 'api', 'src', 'core', 'interceptors', 'json-api-response.interceptor.ts'),
};

const requiredShapeKeys = ['data', 'total', 'page', 'limit', 'totalPages'];

async function main() {
    const findings = [];
    const warnings = [];
    const notes = [];

    const contents = await readFiles(files, findings);

    const riskMapChecks = inspectRiskMap(contents.riskMap);
    const frontendWrapperChecks = inspectBusinessApiGetAll(contents.endpoints);
    const businessesListChecks = inspectBusinessesListConsumer(contents.businessesList);
    const controllerChecks = inspectBusinessesController(contents.businessesController);
    const businessesServiceChecks = inspectBusinessesService(contents.businessesService);
    const searchServiceChecks = inspectSearchService(contents.searchService);
    const jsonApiChecks = inspectJsonApiResponseInterceptor(contents.jsonApiResponseInterceptor);

    if (!riskMapChecks.documentsGetBusinessesShape) {
        warnings.push(warning(
            'docs/API_RESPONSE_SHAPE_RISK_MAP.md',
            'The response shape risk map does not appear to document GET /businesses.',
            'Keep the roadmap updated when response-shape checks evolve.',
        ));
    }

    if (!frontendWrapperChecks.exists) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAll was not detected.',
            'Confirm the frontend wrapper for GET /businesses before changing response shape.',
        ));
    }

    if (!frontendWrapperChecks.callsBusinessesEndpoint) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAll does not appear to call api.get("/businesses", { params }).',
            'GET /businesses response-shape checks should follow the actual wrapper route.',
        ));
    }

    if (frontendWrapperChecks.transformsResponseData) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAll appears to transform response.data before returning.',
            'This check expects getAll to return the raw AxiosResponse from api.get.',
        ));
    }

    if (!businessesListChecks.callsGetAll) {
        findings.push(finding(
            'apps/web/src/pages/BusinessesList.tsx',
            'BusinessesList does not appear to call businessApi.getAll(params).',
            'Review the primary public listing consumer before changing this contract.',
        ));
    }

    for (const key of ['data', 'total', 'totalPages']) {
        if (!businessesListChecks.consumedKeys.has(key)) {
            findings.push(finding(
                'apps/web/src/pages/BusinessesList.tsx',
                `BusinessesList does not appear to consume businessesRes.data.${key}.`,
                `Keep the GET /businesses response shape aligned with the listing consumer for "${key}".`,
            ));
        }
    }

    if (!controllerChecks.controllerPrefix) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController does not appear to use @Controller("businesses").',
            'Confirm the public list route before relying on this check.',
        ));
    }

    if (!controllerChecks.findAllGetRoute) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findAll does not appear to expose @Get().',
            'GET /businesses should remain the public businesses listing route.',
        ));
    }

    if (!controllerChecks.delegatesToBusinessesServiceFindAll) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findAll does not appear to delegate to businessesService.findAll.',
            'Trace the response producer before changing the contract.',
        ));
    }

    if (!businessesServiceChecks.delegatesToSearchService) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findAll does not appear to delegate to searchService.listPublicBusinesses.',
            'Update the response-shape check if the producer moves.',
        ));
    }

    if (!searchServiceChecks.listPublicBusinessesUsesDatabaseProducer) {
        findings.push(finding(
            'apps/api/src/search/search.service.ts',
            'SearchService.listPublicBusinesses does not appear to call listPublicBusinessesViaDatabase.',
            'Review cache/producer flow before relying on static shape inspection.',
        ));
    }

    for (const key of requiredShapeKeys) {
        if (!searchServiceChecks.producedKeys.has(key)) {
            findings.push(finding(
                'apps/api/src/search/search.service.ts',
                `listPublicBusinessesViaDatabase does not appear to return "${key}".`,
                `GET /businesses response shape should include "${key}".`,
            ));
        }
    }

    if (!searchServiceChecks.emptyBranchHasDataArray) {
        findings.push(finding(
            'apps/api/src/search/search.service.ts',
            'The empty-result branch does not appear to preserve data: [].',
            'The frontend expects data to be an array even when there are no results.',
        ));
    }

    if (!searchServiceChecks.emptyBranchHasTotalPages) {
        findings.push(finding(
            'apps/api/src/search/search.service.ts',
            'The empty-result branch does not appear to preserve totalPages.',
            'Keep pagination metadata stable for empty result sets.',
        ));
    }

    if (searchServiceChecks.producedKeys.has('source')) {
        notes.push('Backend returns extra "source" metadata for GET /businesses; this is permitted and not required by BusinessesList.');
    }

    if (jsonApiChecks.hasJsonApiResponseEnabledToggle) {
        warnings.push(warning(
            'apps/api/src/core/interceptors/json-api-response.interceptor.ts',
            'JSON_API_RESPONSE_ENABLED toggle is present. If enabled, GET /businesses would likely become response.data.data.data for current consumers.',
            'Keep JSON_API_RESPONSE_ENABLED disabled until frontend adapters and contract tests exist.',
        ));
    }

    printReport({
        findings,
        warnings,
        notes,
        riskMapChecks,
        frontendWrapperChecks,
        businessesListChecks,
        controllerChecks,
        businessesServiceChecks,
        searchServiceChecks,
        jsonApiChecks,
    });
}

async function readFiles(fileMap, findings) {
    const entries = await Promise.all(Object.entries(fileMap).map(async ([key, filePath]) => {
        try {
            return [key, await fs.readFile(filePath, 'utf8')];
        } catch (error) {
            findings.push(finding(
                normalizePath(path.relative(projectRoot, filePath)),
                `Unable to read required file: ${error instanceof Error ? error.message : String(error)}`,
                'Run this check from the repository root and confirm the file still exists.',
            ));
            return [key, ''];
        }
    }));

    return Object.fromEntries(entries);
}

function inspectRiskMap(content) {
    return {
        documentsGetBusinessesShape: /GET\s+\/businesses/.test(content)
            && /data,\s*total,\s*page,\s*limit,\s*totalPages/.test(content),
    };
}

function inspectBusinessApiGetAll(content) {
    const block = extractObjectMethodBlock(content, 'getAll');
    return {
        exists: block.length > 0,
        callsBusinessesEndpoint: /api\.get\(\s*['"]\/businesses['"]\s*,\s*\{\s*params\s*\}\s*\)/.test(block),
        transformsResponseData: /(?:\.then\s*\(|response\.data|=>\s*[^;\n]*\.data\b)/.test(block),
    };
}

function inspectBusinessesListConsumer(content) {
    const consumedKeys = new Set();
    for (const key of ['data', 'total', 'totalPages']) {
        if (new RegExp(`businessesRes\\.data\\.${key}\\b`).test(content)) {
            consumedKeys.add(key);
        }
    }

    return {
        callsGetAll: /businessApi\.getAll\(\s*params\s*\)/.test(content),
        consumedKeys,
    };
}

function inspectBusinessesController(content) {
    const handlerBlock = extractMethodWithDecoratorsBlock(content, 'findAll');
    return {
        controllerPrefix: /@Controller\(\s*['"]businesses['"]\s*\)/.test(content),
        findAllGetRoute: /@Get\(\s*\)/.test(handlerBlock),
        delegatesToBusinessesServiceFindAll: /this\.businessesService\.findAll\(\s*query\s*,/.test(handlerBlock),
    };
}

function inspectBusinessesService(content) {
    const block = extractMethodBlock(content, 'findAll');
    return {
        delegatesToSearchService: /this\.searchService\.listPublicBusinesses\(\s*query\s*,/.test(block),
    };
}

function inspectSearchService(content) {
    const listBlock = extractMethodBlock(content, 'listPublicBusinesses');
    const producerBlock = extractMethodBlock(content, 'listPublicBusinessesViaDatabase');
    const producedKeys = extractReturnedObjectKeys(producerBlock);
    const emptyBranch = extractFirstIfBlock(producerBlock, /if\s*\(\s*candidates\.length\s*===\s*0\s*\)/);

    return {
        listPublicBusinessesUsesDatabaseProducer: /this\.listPublicBusinessesViaDatabase\(\s*normalizedQuery\s*\)/.test(listBlock),
        producedKeys,
        emptyBranchHasDataArray: /data\s*:\s*\[\s*\]/.test(emptyBranch),
        emptyBranchHasTotalPages: /totalPages\s*:/.test(emptyBranch),
    };
}

function inspectJsonApiResponseInterceptor(content) {
    return {
        hasJsonApiResponseEnabledToggle: /JSON_API_RESPONSE_ENABLED/.test(content),
        wrapsPayloadInData: /data\s*:\s*payload/.test(content),
    };
}

function extractReturnedObjectKeys(content) {
    const keys = new Set();
    const returnedObjectPattern = /return\s*\{([\s\S]*?)\};/g;
    let match;

    while ((match = returnedObjectPattern.exec(content)) !== null) {
        for (const key of extractObjectLiteralKeys(match[1])) {
            keys.add(key);
        }
    }

    return keys;
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

function extractMethodBlock(content, methodName) {
    const methodPattern = new RegExp(`(?:^|\\n)\\s*(?:private\\s+)?(?:async\\s+)?${escapeRegExp(methodName)}\\s*\\(`);
    const methodMatch = methodPattern.exec(content);
    if (!methodMatch) {
        return '';
    }

    const openParen = content.indexOf('(', methodMatch.index);
    const closeParen = findMatchingDelimiter(content, openParen, '(', ')');
    const openBrace = closeParen === -1
        ? -1
        : content.indexOf('{', closeParen);
    if (openBrace === -1) {
        return '';
    }

    return extractBraceBlockFrom(content, openBrace);
}

function findMatchingDelimiter(content, openIndex, openChar, closeChar) {
    if (openIndex === -1 || content[openIndex] !== openChar) {
        return -1;
    }

    let depth = 0;
    for (let index = openIndex; index < content.length; index += 1) {
        const char = content[index];
        if (char === openChar) {
            depth += 1;
        }
        if (char === closeChar) {
            depth -= 1;
        }
        if (depth === 0) {
            return index;
        }
    }

    return -1;
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

    const methodBody = extractBraceBlockFrom(content, openBrace);
    const bodyEnd = openBrace + methodBody.length;
    return content.slice(start, bodyEnd);
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

function extractFirstIfBlock(content, ifPattern) {
    const ifMatch = ifPattern.exec(content);
    if (!ifMatch) {
        return '';
    }

    const openBrace = content.indexOf('{', ifMatch.index);
    if (openBrace === -1) {
        return '';
    }

    return extractBraceBlockFrom(content, openBrace);
}

function extractBraceBlockFrom(content, openBraceIndex) {
    let depth = 0;
    for (let index = openBraceIndex; index < content.length; index += 1) {
        const char = content[index];
        if (char === '{') {
            depth += 1;
        }
        if (char === '}') {
            depth -= 1;
        }
        if (depth === 0) {
            return content.slice(openBraceIndex, index + 1);
        }
    }

    return content.slice(openBraceIndex);
}

function printReport({
    findings,
    warnings,
    notes,
    riskMapChecks,
    frontendWrapperChecks,
    businessesListChecks,
    controllerChecks,
    businessesServiceChecks,
    searchServiceChecks,
    jsonApiChecks,
}) {
    console.log('[businesses-response-shape-check] Report-only GET /businesses response shape check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');

    console.log('Expected GET /businesses response shape:');
    console.log('- data: Business[]');
    console.log('- total: number');
    console.log('- page: number');
    console.log('- limit: number');
    console.log('- totalPages: number');
    console.log('');

    console.log('Frontend wrapper:');
    console.log(`- risk map documents shape: ${formatBoolean(riskMapChecks.documentsGetBusinessesShape)}`);
    console.log(`- businessApi.getAll exists: ${formatBoolean(frontendWrapperChecks.exists)}`);
    console.log(`- calls api.get('/businesses', { params }): ${formatBoolean(frontendWrapperChecks.callsBusinessesEndpoint)}`);
    console.log(`- transforms response.data: ${formatBoolean(frontendWrapperChecks.transformsResponseData)}`);
    console.log('');

    console.log('BusinessesList consumer:');
    console.log(`- calls businessApi.getAll(params): ${formatBoolean(businessesListChecks.callsGetAll)}`);
    console.log(`- consumes businessesRes.data.data: ${formatBoolean(businessesListChecks.consumedKeys.has('data'))}`);
    console.log(`- consumes businessesRes.data.total: ${formatBoolean(businessesListChecks.consumedKeys.has('total'))}`);
    console.log(`- consumes businessesRes.data.totalPages: ${formatBoolean(businessesListChecks.consumedKeys.has('totalPages'))}`);
    console.log('');

    console.log('Backend producer:');
    console.log(`- BusinessesController @Controller('businesses'): ${formatBoolean(controllerChecks.controllerPrefix)}`);
    console.log(`- BusinessesController.findAll @Get(): ${formatBoolean(controllerChecks.findAllGetRoute)}`);
    console.log(`- BusinessesController.findAll delegates to businessesService.findAll: ${formatBoolean(controllerChecks.delegatesToBusinessesServiceFindAll)}`);
    console.log(`- BusinessesService.findAll delegates to searchService.listPublicBusinesses: ${formatBoolean(businessesServiceChecks.delegatesToSearchService)}`);
    console.log(`- SearchService.listPublicBusinesses uses listPublicBusinessesViaDatabase: ${formatBoolean(searchServiceChecks.listPublicBusinessesUsesDatabaseProducer)}`);
    for (const key of requiredShapeKeys) {
        console.log(`- backend returns ${key}: ${formatBoolean(searchServiceChecks.producedKeys.has(key))}`);
    }
    console.log(`- empty branch preserves data: []: ${formatBoolean(searchServiceChecks.emptyBranchHasDataArray)}`);
    console.log(`- empty branch preserves totalPages: ${formatBoolean(searchServiceChecks.emptyBranchHasTotalPages)}`);
    console.log(`- backend returns optional source metadata: ${formatBoolean(searchServiceChecks.producedKeys.has('source'))}`);
    console.log('');

    console.log('Informational JSON:API risk:');
    console.log(`- JSON_API_RESPONSE_ENABLED toggle detected: ${formatBoolean(jsonApiChecks.hasJsonApiResponseEnabledToggle)}`);
    console.log(`- interceptor wraps payload under data: ${formatBoolean(jsonApiChecks.wrapsPayloadInData)}`);
    console.log('');

    if (findings.length > 0) {
        console.log(`Findings (${findings.length}):`);
        for (const item of findings) {
            console.log(`- ${item.location}: ${item.message}`);
            console.log(`  Recommendation: ${item.recommendation}`);
        }
    } else {
        console.log('Findings: none');
    }

    if (warnings.length > 0) {
        console.log('');
        console.log(`Warnings (${warnings.length}):`);
        for (const item of warnings) {
            console.log(`- ${item.location}: ${item.message}`);
            console.log(`  Recommendation: ${item.recommendation}`);
        }
    }

    if (notes.length > 0) {
        console.log('');
        console.log('Notes:');
        for (const note of notes) {
            console.log(`- ${note}`);
        }
    }

    console.log('');
    console.log('Report-only mode: findings do not change exit code and this script is not wired into CI.');
}

function finding(location, message, recommendation) {
    return { location, message, recommendation };
}

function warning(location, message, recommendation) {
    return { location, message, recommendation };
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
    console.error('[businesses-response-shape-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
