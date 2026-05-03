import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-admin-businesses-response-shape.mjs
// Scope: GET /businesses/admin/all response shape expected by AdminDashboard against backend producer.

const projectRoot = process.cwd();

const files = {
    riskMap: path.join(projectRoot, 'docs', 'ADMIN_RESPONSE_SHAPE_RISK_MAP.md'),
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    adminDashboard: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'AdminDashboard.tsx'),
    businessesController: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.controller.ts'),
    businessesService: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.service.ts'),
    businessesSelects: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.selects.ts'),
    businessesHelpers: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.helpers.ts'),
    jsonApiResponseInterceptor: path.join(projectRoot, 'apps', 'api', 'src', 'core', 'interceptors', 'json-api-response.interceptor.ts'),
};

const requiredShapeKeys = ['data', 'total', 'page', 'limit', 'totalPages'];

async function main() {
    const findings = [];
    const warnings = [];
    const notes = [];

    const contents = await readFiles(files, findings);

    const riskMapChecks = inspectRiskMap(contents.riskMap);
    const frontendWrapperChecks = inspectBusinessApiGetAllAdmin(contents.endpoints);
    const adminDashboardChecks = inspectAdminDashboard(contents.adminDashboard);
    const controllerChecks = inspectBusinessesController(contents.businessesController);
    const businessesServiceChecks = inspectBusinessesService(contents.businessesService);
    const selectsChecks = inspectBusinessesSelects(contents.businessesSelects);
    const helpersChecks = inspectBusinessesHelpers(contents.businessesHelpers);
    const jsonApiChecks = inspectJsonApiResponseInterceptor(contents.jsonApiResponseInterceptor);

    if (!riskMapChecks.documentsAdminBusinessesShape) {
        warnings.push(warning(
            'docs/ADMIN_RESPONSE_SHAPE_RISK_MAP.md',
            'The admin response shape risk map does not appear to document GET /businesses/admin/all.',
            'Keep the admin risk map updated when admin response-shape checks evolve.',
        ));
    }

    if (!frontendWrapperChecks.exists) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAllAdmin was not detected.',
            'Confirm the frontend wrapper for GET /businesses/admin/all before changing response shape.',
        ));
    }

    if (!frontendWrapperChecks.callsAdminBusinessesEndpoint) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAllAdmin does not appear to call api.get("/businesses/admin/all", { params }).',
            'GET /businesses/admin/all response-shape checks should follow the actual wrapper route.',
        ));
    }

    if (frontendWrapperChecks.transformsResponseData) {
        findings.push(finding(
            'apps/web/src/api/endpoints.ts',
            'businessApi.getAllAdmin appears to transform response.data before returning.',
            'This check expects getAllAdmin to return the raw AxiosResponse from api.get.',
        ));
    }

    if (!adminDashboardChecks.loadDataExists) {
        findings.push(finding(
            'apps/web/src/pages/AdminDashboard.tsx',
            'AdminDashboard.loadData was not detected.',
            'Review the admin businesses consumer before changing this contract.',
        ));
    }

    if (!adminDashboardChecks.callsGetAllAdminLimit100) {
        findings.push(finding(
            'apps/web/src/pages/AdminDashboard.tsx',
            'AdminDashboard.loadData does not appear to call businessApi.getAllAdmin({ limit: 100 }).',
            'The admin businesses response-shape check should follow the primary admin listing request.',
        ));
    }

    if (!adminDashboardChecks.consumesDataData) {
        findings.push(finding(
            'apps/web/src/pages/AdminDashboard.tsx',
            'AdminDashboard.loadData does not appear to consume businessesResponse.data.data.',
            'GET /businesses/admin/all should remain an envelope with data: Business[].',
        ));
    }

    if (adminDashboardChecks.consumesDataItems) {
        findings.push(finding(
            'apps/web/src/pages/AdminDashboard.tsx',
            'AdminDashboard.loadData appears to consume businessesResponse.data.items for admin businesses.',
            'GET /businesses/admin/all should not use the moderation-queue { items } shape.',
        ));
    }

    if (adminDashboardChecks.consumesDirectArray) {
        findings.push(finding(
            'apps/web/src/pages/AdminDashboard.tsx',
            'AdminDashboard.loadData appears to treat businessesResponse.data as a direct array.',
            'GET /businesses/admin/all should remain a paginated envelope consumed via businessesResponse.data.data.',
        ));
    }

    if (!controllerChecks.controllerPrefix) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController does not appear to use @Controller("businesses").',
            'Confirm the admin businesses route prefix before relying on this check.',
        ));
    }

    if (!controllerChecks.findAllAdminGetRoute) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findAllAdmin does not appear to expose @Get("admin/all").',
            'GET /businesses/admin/all should remain the admin businesses listing route.',
        ));
    }

    if (!controllerChecks.usesJwtAuthGuard || !controllerChecks.usesRolesGuard || !controllerChecks.usesAdminRole) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findAllAdmin does not appear to keep JwtAuthGuard, RolesGuard, and @Roles("ADMIN").',
            'This check is response-shape focused, but admin route protection drift should be reviewed separately.',
        ));
    }

    if (!controllerChecks.delegatesToBusinessesServiceFindAllAdmin) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findAllAdmin does not appear to delegate to businessesService.findAllAdmin(query).',
            'Trace the backend producer before changing the admin list contract.',
        ));
    }

    if (!businessesServiceChecks.findAllAdminExists) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findAllAdmin was not detected.',
            'The admin list response shape should have a stable backend producer.',
        ));
    }

    for (const key of requiredShapeKeys) {
        if (!businessesServiceChecks.producedKeys.has(key)) {
            findings.push(finding(
                'apps/api/src/businesses/businesses.service.ts',
                `BusinessesService.findAllAdmin does not appear to return "${key}".`,
                `GET /businesses/admin/all response shape should include "${key}".`,
            ));
        }
    }

    if (!businessesServiceChecks.usesDecorateBusinessProfiles) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findAllAdmin does not clearly derive data from decorateBusinessProfiles(...).',
            'This is informational because the check only validates envelope shape, not full Business[] content.',
        ));
    }

    if (!businessesServiceChecks.usesAdminListSelect) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findAllAdmin does not appear to use adminListBusinessSelect.',
            'This check does not validate the full Business[] shape, but select drift can affect admin columns.',
        ));
    }

    if (!selectsChecks.adminListBusinessSelectExists) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.selects.ts',
            'adminListBusinessSelect was not detected.',
            'This check does not validate every selected field, but missing select can indicate producer drift.',
        ));
    }

    if (!helpersChecks.decorateBusinessProfilesExists) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.helpers.ts',
            'decorateBusinessProfiles was not detected.',
            'This check does not validate decoration behavior, but findAllAdmin currently relies on decorated profiles.',
        ));
    }

    if (jsonApiChecks.hasJsonApiResponseEnabledToggle) {
        warnings.push(warning(
            'apps/api/src/core/interceptors/json-api-response.interceptor.ts',
            'JSON_API_RESPONSE_ENABLED toggle is present. If enabled, admin businesses would likely move from response.data.data to response.data.data.data.',
            'Keep JSON_API_RESPONSE_ENABLED disabled until frontend adapters and runtime contract tests exist.',
        ));
    }

    if (businessesServiceChecks.usesDecorateBusinessProfiles) {
        notes.push('BusinessesService.findAllAdmin currently decorates admin list records before returning data.');
    }

    printReport({
        findings,
        warnings,
        notes,
        riskMapChecks,
        frontendWrapperChecks,
        adminDashboardChecks,
        controllerChecks,
        businessesServiceChecks,
        selectsChecks,
        helpersChecks,
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
        documentsAdminBusinessesShape: /GET\s+\/businesses\/admin\/all/.test(content)
            && /\{\s*data,\s*total,\s*page,\s*limit,\s*totalPages\s*\}/.test(content),
    };
}

function inspectBusinessApiGetAllAdmin(content) {
    const businessApiBlock = extractExportedObjectBlock(content, 'businessApi');
    const block = extractObjectMethodBlock(businessApiBlock, 'getAllAdmin');
    return {
        exists: block.length > 0,
        callsAdminBusinessesEndpoint: /api\.get\(\s*['"]\/businesses\/admin\/all['"]\s*,\s*\{\s*params\s*\}\s*\)/.test(block),
        transformsResponseData: /(?:\.then\s*\(|response\.data|=>\s*[^;\n]*\.data\b)/.test(block),
    };
}

function inspectAdminDashboard(content) {
    const loadDataBlock = extractConstUseCallbackBlock(content, 'loadData');
    return {
        loadDataExists: loadDataBlock.length > 0,
        callsGetAllAdminLimit100: /businessApi\.getAllAdmin\(\s*\{\s*limit\s*:\s*100\s*\}\s*\)/.test(loadDataBlock),
        consumesDataData: /setBusinesses\(\s*businessesResponse\.data\.data\s*\|\|\s*\[\s*\]\s*\)/.test(loadDataBlock)
            || /businessesResponse\.data\.data\b/.test(loadDataBlock),
        consumesDataItems: /businessesResponse\.data\??\.items\b/.test(loadDataBlock),
        consumesDirectArray: /setBusinesses\(\s*\(?\s*businessesResponse\.data\s*(?:\|\||\?\?|\))/.test(loadDataBlock)
            && !/businessesResponse\.data\.data\b/.test(loadDataBlock),
    };
}

function inspectBusinessesController(content) {
    const handlerBlock = extractMethodWithDecoratorsBlock(content, 'findAllAdmin');
    return {
        controllerPrefix: /@Controller\(\s*['"]businesses['"]\s*\)/.test(content),
        findAllAdminGetRoute: /@Get\(\s*['"]admin\/all['"]\s*\)/.test(handlerBlock),
        usesJwtAuthGuard: /\bJwtAuthGuard\b/.test(handlerBlock),
        usesRolesGuard: /\bRolesGuard\b/.test(handlerBlock),
        usesAdminRole: /@Roles\(\s*['"]ADMIN['"]\s*\)/.test(handlerBlock),
        delegatesToBusinessesServiceFindAllAdmin: /this\.businessesService\.findAllAdmin\(\s*query\s*\)/.test(handlerBlock),
    };
}

function inspectBusinessesService(content) {
    const block = extractMethodBlock(content, 'findAllAdmin');
    return {
        findAllAdminExists: block.length > 0,
        producedKeys: extractReturnedObjectKeys(block),
        usesDecorateBusinessProfiles: /const\s+decoratedData\s*=\s*decorateBusinessProfiles\(/.test(block)
            && /data\s*:\s*decoratedData/.test(block),
        usesAdminListSelect: /select\s*:\s*adminListBusinessSelect/.test(block),
    };
}

function inspectBusinessesSelects(content) {
    return {
        adminListBusinessSelectExists: /export\s+const\s+adminListBusinessSelect\s*=/.test(content),
    };
}

function inspectBusinessesHelpers(content) {
    return {
        decorateBusinessProfilesExists: /export\s+function\s+decorateBusinessProfiles\b/.test(content),
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
    const keys = new Set();
    const keyPattern = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g;
    let match;
    while ((match = keyPattern.exec(source)) !== null) {
        keys.add(match[1]);
    }

    const shorthandPattern = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?=,|\n|})/g;
    while ((match = shorthandPattern.exec(source)) !== null) {
        keys.add(match[1]);
    }

    return [...keys];
}

function extractExportedObjectBlock(content, objectName) {
    const marker = `export const ${objectName} =`;
    const start = content.indexOf(marker);
    if (start === -1) {
        return '';
    }

    const openBrace = content.indexOf('{', start);
    if (openBrace === -1) {
        return '';
    }

    return extractBraceBlockFrom(content, openBrace);
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

function extractConstUseCallbackBlock(content, name) {
    const marker = `const ${name} = useCallback(`;
    const start = content.indexOf(marker);
    if (start === -1) {
        return '';
    }

    const asyncArrow = content.indexOf('async', start);
    const openBrace = asyncArrow === -1
        ? content.indexOf('{', start)
        : content.indexOf('{', asyncArrow);
    if (openBrace === -1) {
        return '';
    }

    return extractBraceBlockFrom(content, openBrace);
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

function extractMethodWithDecoratorsBlock(content, methodName) {
    const methodPattern = new RegExp(`async\\s+${escapeRegExp(methodName)}\\s*\\(`);
    const methodMatch = methodPattern.exec(content);
    if (!methodMatch) {
        return '';
    }

    const routeDecoratorIndex = content.lastIndexOf('@Get(', methodMatch.index);
    const start = routeDecoratorIndex === -1 ? methodMatch.index : routeDecoratorIndex;
    const openParen = content.indexOf('(', methodMatch.index);
    const closeParen = findMatchingDelimiter(content, openParen, '(', ')');
    const openBrace = closeParen === -1
        ? -1
        : content.indexOf('{', closeParen);
    if (openBrace === -1) {
        return content.slice(start, methodMatch.index);
    }

    const methodBody = extractBraceBlockFrom(content, openBrace);
    const bodyEnd = openBrace + methodBody.length;
    return content.slice(start, bodyEnd);
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
    adminDashboardChecks,
    controllerChecks,
    businessesServiceChecks,
    selectsChecks,
    helpersChecks,
    jsonApiChecks,
}) {
    console.log('[admin-businesses-response-shape-check] Report-only GET /businesses/admin/all response shape check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');

    console.log('Expected GET /businesses/admin/all response shape:');
    console.log('- data: Business[]');
    console.log('- total: number');
    console.log('- page: number');
    console.log('- limit: number');
    console.log('- totalPages: number');
    console.log('');

    console.log('Frontend wrapper:');
    console.log(`- risk map documents admin businesses shape: ${formatBoolean(riskMapChecks.documentsAdminBusinessesShape)}`);
    console.log(`- businessApi.getAllAdmin exists: ${formatBoolean(frontendWrapperChecks.exists)}`);
    console.log(`- calls api.get('/businesses/admin/all', { params }): ${formatBoolean(frontendWrapperChecks.callsAdminBusinessesEndpoint)}`);
    console.log(`- transforms response.data: ${formatBoolean(frontendWrapperChecks.transformsResponseData)}`);
    console.log('');

    console.log('AdminDashboard consumer:');
    console.log(`- loadData exists: ${formatBoolean(adminDashboardChecks.loadDataExists)}`);
    console.log(`- calls businessApi.getAllAdmin({ limit: 100 }): ${formatBoolean(adminDashboardChecks.callsGetAllAdminLimit100)}`);
    console.log(`- consumes businessesResponse.data.data: ${formatBoolean(adminDashboardChecks.consumesDataData)}`);
    console.log(`- consumes businessesResponse.data.items: ${formatBoolean(adminDashboardChecks.consumesDataItems)}`);
    console.log(`- treats businessesResponse.data as direct array: ${formatBoolean(adminDashboardChecks.consumesDirectArray)}`);
    console.log('');

    console.log('Backend route and producer:');
    console.log(`- BusinessesController @Controller('businesses'): ${formatBoolean(controllerChecks.controllerPrefix)}`);
    console.log(`- BusinessesController.findAllAdmin @Get('admin/all'): ${formatBoolean(controllerChecks.findAllAdminGetRoute)}`);
    console.log(`- JwtAuthGuard: ${formatBoolean(controllerChecks.usesJwtAuthGuard)}`);
    console.log(`- RolesGuard: ${formatBoolean(controllerChecks.usesRolesGuard)}`);
    console.log(`- @Roles('ADMIN'): ${formatBoolean(controllerChecks.usesAdminRole)}`);
    console.log(`- delegates to businessesService.findAllAdmin(query): ${formatBoolean(controllerChecks.delegatesToBusinessesServiceFindAllAdmin)}`);
    console.log(`- BusinessesService.findAllAdmin exists: ${formatBoolean(businessesServiceChecks.findAllAdminExists)}`);
    for (const key of requiredShapeKeys) {
        console.log(`- findAllAdmin returns ${key}: ${formatBoolean(businessesServiceChecks.producedKeys.has(key))}`);
    }
    console.log(`- data derived from decorateBusinessProfiles(...): ${formatBoolean(businessesServiceChecks.usesDecorateBusinessProfiles)}`);
    console.log(`- uses adminListBusinessSelect: ${formatBoolean(businessesServiceChecks.usesAdminListSelect)}`);
    console.log(`- adminListBusinessSelect exists: ${formatBoolean(selectsChecks.adminListBusinessSelectExists)}`);
    console.log(`- decorateBusinessProfiles exists: ${formatBoolean(helpersChecks.decorateBusinessProfilesExists)}`);
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
    console.error('[admin-businesses-response-shape-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
