import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-business-detail-response-shape.mjs
// Scope: GET /businesses/:identifier response shape expected by BusinessDetails against backend producer.

const projectRoot = process.cwd();

const files = {
    riskMap: path.join(projectRoot, 'docs', 'API_RESPONSE_SHAPE_RISK_MAP.md'),
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    businessDetails: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'BusinessDetails.tsx'),
    businessesController: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.controller.ts'),
    businessesService: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.service.ts'),
    businessesSelects: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.selects.ts'),
    businessesHelpers: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.helpers.ts'),
    businessProfile: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'business-profile.ts'),
    jsonApiResponseInterceptor: path.join(projectRoot, 'apps', 'api', 'src', 'core', 'interceptors', 'json-api-response.interceptor.ts'),
};

const detailWrappers = [
    { key: 'getByIdentifier', variable: 'identifier' },
    { key: 'getById', variable: 'id' },
    { key: 'getBySlug', variable: 'slug' },
];

const requiredDetailSelectKeys = [
    'id',
    'name',
    'slug',
    'description',
    'address',
    'phone',
    'whatsapp',
    'latitude',
    'longitude',
    'verified',
    'claimStatus',
    'isClaimable',
    'province',
    'city',
    'sector',
    'categories',
    'images',
    'hours',
    '_count',
];

const allowedDecoratedExtras = [
    'profileCompletenessScore',
    'missingCoreFields',
    'openNow',
    'todayHoursLabel',
];

async function main() {
    const findings = [];
    const warnings = [];
    const notes = [];

    const contents = await readFiles(files, findings);

    const riskMapChecks = inspectRiskMap(contents.riskMap);
    const frontendWrapperChecks = inspectBusinessApiDetailWrappers(contents.endpoints);
    const businessDetailsChecks = inspectBusinessDetails(contents.businessDetails);
    const controllerChecks = inspectBusinessesController(contents.businessesController);
    const serviceChecks = inspectBusinessesService(contents.businessesService);
    const selectChecks = inspectBusinessesSelects(contents.businessesSelects);
    const helperChecks = inspectBusinessesHelpers(contents.businessesHelpers);
    const profileChecks = inspectBusinessProfile(contents.businessProfile);
    const jsonApiChecks = inspectJsonApiResponseInterceptor(contents.jsonApiResponseInterceptor);

    if (!riskMapChecks.documentsBusinessDetailShape) {
        warnings.push(warning(
            'docs/API_RESPONSE_SHAPE_RISK_MAP.md',
            'The response shape risk map does not appear to document GET /businesses/:identifier as a direct object.',
            'Keep the risk map updated when detail response-shape checks evolve.',
        ));
    }

    for (const wrapperSpec of detailWrappers) {
        const wrapper = frontendWrapperChecks.wrappers[wrapperSpec.key];
        if (!wrapper?.exists) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `businessApi.${wrapperSpec.key} was not detected.`,
                `Confirm the frontend wrapper for GET /businesses/:identifier before changing detail response shape.`,
            ));
            continue;
        }

        if (!wrapper.callsExpectedEndpoint) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `businessApi.${wrapperSpec.key} does not appear to call /businesses/\${${wrapperSpec.variable}}.`,
                'Business detail response-shape checks should follow the actual wrapper route.',
            ));
        }

        if (wrapper.transformsResponseData) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `businessApi.${wrapperSpec.key} appears to transform response.data before returning.`,
                'BusinessDetails currently expects the raw AxiosResponse and consumes response.data as the business object.',
            ));
        }
    }

    if (!businessDetailsChecks.usesGetBySlug) {
        findings.push(finding(
            'apps/web/src/pages/BusinessDetails.tsx',
            'BusinessDetails does not appear to call businessApi.getBySlug(slug).',
            'Keep the primary detail consumer aligned before changing this contract.',
        ));
    }

    if (!businessDetailsChecks.usesGetByIdentifierFallback) {
        findings.push(finding(
            'apps/web/src/pages/BusinessDetails.tsx',
            'BusinessDetails does not appear to fall back to businessApi.getByIdentifier(slug).',
            'Confirm the detail-loading flow before relying on this static response-shape check.',
        ));
    }

    if (!businessDetailsChecks.setsBusinessFromDirectResponseData) {
        findings.push(finding(
            'apps/web/src/pages/BusinessDetails.tsx',
            'BusinessDetails does not appear to call setBusiness(res.data).',
            'GET /businesses/:identifier is expected to return the Business object directly in response.data.',
        ));
    }

    if (businessDetailsChecks.usesNestedDataForPrimaryBusiness) {
        findings.push(finding(
            'apps/web/src/pages/BusinessDetails.tsx',
            'BusinessDetails appears to consume res.data.data for the primary business detail.',
            'The current detail contract should remain a direct object at response.data, not response.data.data.',
        ));
    }

    if (!controllerChecks.controllerPrefix) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController does not appear to use @Controller("businesses").',
            'Confirm the route prefix before relying on this check.',
        ));
    }

    if (!controllerChecks.hasIdentifierRoute) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'BusinessesController.findByIdentifier does not appear to expose @Get(":identifier").',
            'GET /businesses/:identifier should remain the public detail route.',
        ));
    }

    if (!controllerChecks.usesIdentifierParam) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'findByIdentifier does not appear to use @Param("identifier").',
            'The route parameter should remain the identifier source for id/slug detail loading.',
        ));
    }

    if (!controllerChecks.delegatesUuidToFindById) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'findByIdentifier does not appear to delegate UUID identifiers to businessesService.findById.',
            'Keep UUID detail loading aligned with the id producer.',
        ));
    }

    if (!controllerChecks.delegatesSlugToFindBySlug) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'findByIdentifier does not appear to delegate non-UUID identifiers to businessesService.findBySlug.',
            'Keep slug detail loading aligned with the slug producer.',
        ));
    }

    if (!controllerChecks.usesOptionalJwtGuard || !controllerChecks.usesOptionalOrgContextGuard) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.controller.ts',
            'GET /businesses/:identifier does not appear to keep OptionalJwtAuthGuard and OptionalOrgContextGuard.',
            'Public detail should remain optional-auth while preserving org context when present.',
        ));
    }

    if (!serviceChecks.findByIdReturnsDecoratedProfile) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findById does not appear to return decorateBusinessProfile(...) directly.',
            'The detail response should remain the decorated Business object, not an envelope.',
        ));
    }

    if (!serviceChecks.findBySlugReturnsDecoratedProfile) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.service.ts',
            'BusinessesService.findBySlug does not appear to return decorateBusinessProfile(...) directly.',
            'The detail response should remain the decorated Business object, not an envelope.',
        ));
    }

    if (!serviceChecks.findByIdUsesPublicCache || !serviceChecks.findBySlugUsesPublicCache) {
        warnings.push(warning(
            'apps/api/src/businesses/businesses.service.ts',
            'One of the public detail flows does not appear to use rememberJsonStaleWhileRevalidate for unauthenticated requests.',
            'This check does not validate cache TTL/SWR, but route drift should be reviewed before changing detail shape.',
        ));
    }

    if (!serviceChecks.findBusinessDetailUsesSelect) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.service.ts',
            'findBusinessDetail does not appear to use businessDetailBaseSelect.',
            'Static shape checks should follow the select that defines the public detail object.',
        ));
    }

    if (!selectChecks.businessDetailBaseSelectExists) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.selects.ts',
            'businessDetailBaseSelect was not detected.',
            'The public detail shape should have an explicit static select.',
        ));
    }

    for (const key of requiredDetailSelectKeys) {
        if (!selectChecks.businessDetailBaseSelectKeys.has(key)) {
            warnings.push(warning(
                'apps/api/src/businesses/businesses.selects.ts',
                `businessDetailBaseSelect does not appear to include "${key}".`,
                'This check does not validate the complete Business shape, but this field is part of the current detail surface.',
            ));
        }
    }

    if (!helperChecks.decorateBusinessProfileExists) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.helpers.ts',
            'decorateBusinessProfile was not detected.',
            'The detail producer should decorate the Business object without wrapping it.',
        ));
    }

    if (!helperChecks.spreadsBusinessObject || helperChecks.wrapsInData) {
        findings.push(finding(
            'apps/api/src/businesses/businesses.helpers.ts',
            'decorateBusinessProfile does not appear to return { ...business, ...extras } without a data wrapper.',
            'Decorated detail should remain a direct Business object.',
        ));
    }

    for (const key of allowedDecoratedExtras) {
        if (!helperChecks.decoratedExtraKeys.has(key)) {
            warnings.push(warning(
                'apps/api/src/businesses/businesses.helpers.ts',
                `decorateBusinessProfile does not appear to add allowed extra "${key}".`,
                'This extra is used as current derived metadata and should be reviewed if removed.',
            ));
        }
    }

    if (!profileChecks.hasProfileCompletenessHelpers || !profileChecks.hasOpenNowHelpers) {
        warnings.push(warning(
            'apps/api/src/businesses/business-profile.ts',
            'Business profile helper functions used by decorateBusinessProfile were not fully detected.',
            'This check does not validate helper behavior, but helper drift can affect derived detail fields.',
        ));
    }

    if (jsonApiChecks.hasJsonApiResponseEnabledToggle) {
        warnings.push(warning(
            'apps/api/src/core/interceptors/json-api-response.interceptor.ts',
            'JSON_API_RESPONSE_ENABLED toggle is present. If enabled, business detail would likely move from response.data to response.data.data.',
            'Keep JSON_API_RESPONSE_ENABLED disabled until frontend adapters and runtime contract tests exist.',
        ));
    }

    if (serviceChecks.findByIdReturnsDecoratedProfile && serviceChecks.findBySlugReturnsDecoratedProfile) {
        notes.push('findById and findBySlug currently return decorateBusinessProfile(...) directly for detail responses.');
    }

    if (helperChecks.spreadsBusinessObject && !helperChecks.wrapsInData) {
        notes.push('decorateBusinessProfile currently preserves the Business object and adds derived fields without wrapping in { data }.');
    }

    printReport({
        findings,
        warnings,
        notes,
        riskMapChecks,
        frontendWrapperChecks,
        businessDetailsChecks,
        controllerChecks,
        serviceChecks,
        selectChecks,
        helperChecks,
        profileChecks,
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
        documentsBusinessDetailShape: /GET\s+\/businesses\/:identifier/.test(content)
            && /objeto\s+negocio\s+directo|objeto\s+directo|response\.data/.test(content),
    };
}

function inspectBusinessApiDetailWrappers(content) {
    const businessApiBlock = extractExportedObjectBlock(content, 'businessApi');
    const wrappers = {};

    for (const wrapperSpec of detailWrappers) {
        const block = extractObjectMethodBlock(businessApiBlock, wrapperSpec.key);
        wrappers[wrapperSpec.key] = {
            exists: block.length > 0,
            callsExpectedEndpoint: new RegExp(`api\\.get\\(\\s*\`/businesses/\\$\\{${escapeRegExp(wrapperSpec.variable)}\\}\`\\s*\\)`).test(block),
            transformsResponseData: /(?:\.then\s*\(|response\.data|=>\s*[^;\n]*\.data\b)/.test(block),
        };
    }

    return { wrappers };
}

function inspectBusinessDetails(content) {
    const loadBusinessBlock = extractConstUseCallbackBlock(content, 'loadBusiness');
    return {
        usesGetBySlug: /businessApi\.getBySlug\(\s*slug\s*\)/.test(loadBusinessBlock),
        usesGetByIdentifierFallback: /businessApi\.getByIdentifier\(\s*slug\s*\)/.test(loadBusinessBlock),
        setsBusinessFromDirectResponseData: /setBusiness\(\s*res\.data\s*\)/.test(loadBusinessBlock),
        usesNestedDataForPrimaryBusiness: /setBusiness\(\s*res\.data\.data/.test(loadBusinessBlock)
            || /res\.data\.data/.test(loadBusinessBlock),
    };
}

function inspectBusinessesController(content) {
    const handlerBlock = extractMethodWithDecoratorsBlock(content, 'findByIdentifier');
    return {
        controllerPrefix: /@Controller\(\s*['"]businesses['"]\s*\)/.test(content),
        hasIdentifierRoute: /@Get\(\s*['"]:identifier['"]\s*\)/.test(handlerBlock),
        usesIdentifierParam: /@Param\(\s*['"]identifier['"]\s*\)\s+identifier\s*:\s*string/.test(handlerBlock),
        delegatesUuidToFindById: /isUUID\(\s*identifier\s*\)[\s\S]*?this\.businessesService\.findById\(\s*identifier\s*,/.test(handlerBlock),
        delegatesSlugToFindBySlug: /return\s+this\.businessesService\.findBySlug\(\s*identifier\s*,/.test(handlerBlock),
        usesOptionalJwtGuard: /\bOptionalJwtAuthGuard\b/.test(handlerBlock),
        usesOptionalOrgContextGuard: /\bOptionalOrgContextGuard\b/.test(handlerBlock),
    };
}

function inspectBusinessesService(content) {
    const findByIdBlock = extractMethodBlock(content, 'findById');
    const findBySlugBlock = extractMethodBlock(content, 'findBySlug');
    const findBusinessDetailBlock = extractMethodBlock(content, 'findBusinessDetail');

    return {
        findByIdReturnsDecoratedProfile: /return\s+decorateBusinessProfile\(/.test(findByIdBlock),
        findBySlugReturnsDecoratedProfile: /return\s+decorateBusinessProfile\(/.test(findBySlugBlock),
        findByIdUsesPublicCache: /rememberJsonStaleWhileRevalidate\(/.test(findByIdBlock)
            && /findPublicBusinessById\(\s*id\s*\)/.test(findByIdBlock),
        findBySlugUsesPublicCache: /rememberJsonStaleWhileRevalidate\(/.test(findBySlugBlock)
            && /findPublicBusinessBySlug\(\s*slug\s*\)/.test(findBySlugBlock),
        findBusinessDetailUsesSelect: /select\s*:\s*businessDetailBaseSelect/.test(findBusinessDetailBlock),
        findBusinessDetailAddsFeaturesAndReviews: /safeLoadBusinessFeatures\(\s*business\.id\s*\)/.test(findBusinessDetailBlock)
            && /safeLoadBusinessReviews\(\s*business\.id\s*\)/.test(findBusinessDetailBlock),
    };
}

function inspectBusinessesSelects(content) {
    const block = extractExportedConstBlock(content, 'businessDetailBaseSelect');
    return {
        businessDetailBaseSelectExists: block.length > 0,
        businessDetailBaseSelectKeys: new Set(extractObjectLiteralKeys(block)),
    };
}

function inspectBusinessesHelpers(content) {
    const block = extractFunctionBlock(content, 'decorateBusinessProfile');
    const decoratedExtraKeys = new Set(extractObjectLiteralKeys(block));
    for (const key of allowedDecoratedExtras) {
        if (new RegExp(`\\b${escapeRegExp(key)}\\b`).test(block)) {
            decoratedExtraKeys.add(key);
        }
    }

    return {
        decorateBusinessProfileExists: block.length > 0,
        spreadsBusinessObject: /\.\.\.business/.test(block),
        wrapsInData: /(?:^|[,{\s])data\s*:/.test(block),
        decoratedExtraKeys,
    };
}

function inspectBusinessProfile(content) {
    return {
        hasProfileCompletenessHelpers: /calculateBusinessProfileCompletenessScore/.test(content)
            && /listMissingBusinessProfileFields/.test(content),
        hasOpenNowHelpers: /isBusinessOpenNow/.test(content)
            && /buildTodayBusinessHoursLabel/.test(content),
    };
}

function inspectJsonApiResponseInterceptor(content) {
    return {
        hasJsonApiResponseEnabledToggle: /JSON_API_RESPONSE_ENABLED/.test(content),
        wrapsPayloadInData: /data\s*:\s*payload/.test(content),
    };
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

function extractExportedConstBlock(content, constName) {
    const marker = `export const ${constName} =`;
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

function extractFunctionBlock(content, functionName) {
    const pattern = new RegExp(`export\\s+function\\s+${escapeRegExp(functionName)}\\b`);
    const match = pattern.exec(content);
    if (!match) {
        return '';
    }

    const openBrace = content.indexOf('{', match.index);
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

function extractObjectLiteralKeys(source) {
    const keys = [];
    const keyPattern = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g;
    let match;
    while ((match = keyPattern.exec(source)) !== null) {
        keys.push(match[1]);
    }
    return keys;
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
    businessDetailsChecks,
    controllerChecks,
    serviceChecks,
    selectChecks,
    helperChecks,
    profileChecks,
    jsonApiChecks,
}) {
    console.log('[business-detail-response-shape-check] Report-only GET /businesses/:identifier response shape check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');

    console.log('Expected GET /businesses/:identifier response shape:');
    console.log('- response.data: Business object');
    console.log('- response.data.data: not expected for the primary detail payload');
    console.log('');

    console.log('Frontend wrappers:');
    console.log(`- risk map documents detail direct object shape: ${formatBoolean(riskMapChecks.documentsBusinessDetailShape)}`);
    for (const wrapperSpec of detailWrappers) {
        const wrapper = frontendWrapperChecks.wrappers[wrapperSpec.key];
        console.log(`- businessApi.${wrapperSpec.key} exists: ${formatBoolean(wrapper?.exists)}`);
        console.log(`- businessApi.${wrapperSpec.key} calls /businesses/\${${wrapperSpec.variable}}: ${formatBoolean(wrapper?.callsExpectedEndpoint)}`);
        console.log(`- businessApi.${wrapperSpec.key} transforms response.data: ${formatBoolean(wrapper?.transformsResponseData)}`);
    }
    console.log('');

    console.log('BusinessDetails consumer:');
    console.log(`- uses businessApi.getBySlug(slug): ${formatBoolean(businessDetailsChecks.usesGetBySlug)}`);
    console.log(`- falls back to businessApi.getByIdentifier(slug): ${formatBoolean(businessDetailsChecks.usesGetByIdentifierFallback)}`);
    console.log(`- sets primary business from res.data: ${formatBoolean(businessDetailsChecks.setsBusinessFromDirectResponseData)}`);
    console.log(`- uses res.data.data for primary business: ${formatBoolean(businessDetailsChecks.usesNestedDataForPrimaryBusiness)}`);
    console.log('');

    console.log('Backend route and producer:');
    console.log(`- BusinessesController @Controller('businesses'): ${formatBoolean(controllerChecks.controllerPrefix)}`);
    console.log(`- @Get(':identifier'): ${formatBoolean(controllerChecks.hasIdentifierRoute)}`);
    console.log(`- @Param('identifier'): ${formatBoolean(controllerChecks.usesIdentifierParam)}`);
    console.log(`- UUID branch delegates to findById: ${formatBoolean(controllerChecks.delegatesUuidToFindById)}`);
    console.log(`- non-UUID branch delegates to findBySlug: ${formatBoolean(controllerChecks.delegatesSlugToFindBySlug)}`);
    console.log(`- OptionalJwtAuthGuard: ${formatBoolean(controllerChecks.usesOptionalJwtGuard)}`);
    console.log(`- OptionalOrgContextGuard: ${formatBoolean(controllerChecks.usesOptionalOrgContextGuard)}`);
    console.log(`- findById returns decorateBusinessProfile(...): ${formatBoolean(serviceChecks.findByIdReturnsDecoratedProfile)}`);
    console.log(`- findBySlug returns decorateBusinessProfile(...): ${formatBoolean(serviceChecks.findBySlugReturnsDecoratedProfile)}`);
    console.log(`- findBusinessDetail uses businessDetailBaseSelect: ${formatBoolean(serviceChecks.findBusinessDetailUsesSelect)}`);
    console.log(`- findBusinessDetail adds features and reviews: ${formatBoolean(serviceChecks.findBusinessDetailAddsFeaturesAndReviews)}`);
    console.log(`- unauthenticated id detail uses SWR cache: ${formatBoolean(serviceChecks.findByIdUsesPublicCache)}`);
    console.log(`- unauthenticated slug detail uses SWR cache: ${formatBoolean(serviceChecks.findBySlugUsesPublicCache)}`);
    console.log('');

    console.log('Select and decorated extras:');
    console.log(`- businessDetailBaseSelect exists: ${formatBoolean(selectChecks.businessDetailBaseSelectExists)}`);
    for (const key of requiredDetailSelectKeys) {
        console.log(`- businessDetailBaseSelect includes ${key}: ${formatBoolean(selectChecks.businessDetailBaseSelectKeys.has(key))}`);
    }
    console.log(`- decorateBusinessProfile exists: ${formatBoolean(helperChecks.decorateBusinessProfileExists)}`);
    console.log(`- decorateBusinessProfile spreads business object: ${formatBoolean(helperChecks.spreadsBusinessObject)}`);
    console.log(`- decorateBusinessProfile wraps in data: ${formatBoolean(helperChecks.wrapsInData)}`);
    for (const key of allowedDecoratedExtras) {
        console.log(`- decorateBusinessProfile adds ${key}: ${formatBoolean(helperChecks.decoratedExtraKeys.has(key))}`);
    }
    console.log(`- profile completeness helpers detected: ${formatBoolean(profileChecks.hasProfileCompletenessHelpers)}`);
    console.log(`- open-now helpers detected: ${formatBoolean(profileChecks.hasOpenNowHelpers)}`);
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
    console.error('[business-detail-response-shape-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
