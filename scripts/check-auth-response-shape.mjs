import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-auth-response-shape.mjs
// Scope: auth session response shape expected by AuthContext against backend producer.

const projectRoot = process.cwd();

const files = {
    riskMap: path.join(projectRoot, 'docs', 'API_RESPONSE_SHAPE_RISK_MAP.md'),
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    authContext: path.join(projectRoot, 'apps', 'web', 'src', 'context', 'AuthContext.tsx'),
    authController: path.join(projectRoot, 'apps', 'api', 'src', 'auth', 'auth.controller.ts'),
    authService: path.join(projectRoot, 'apps', 'api', 'src', 'auth', 'auth.service.ts'),
    authDto: path.join(projectRoot, 'apps', 'api', 'src', 'auth', 'dto', 'auth.dto.ts'),
    jsonApiResponseInterceptor: path.join(projectRoot, 'apps', 'api', 'src', 'core', 'interceptors', 'json-api-response.interceptor.ts'),
};

const authMethods = [
    { key: 'login', route: '/auth/login', controllerMethod: 'login', serviceMethod: 'login', dto: 'LoginDto' },
    { key: 'register', route: '/auth/register', controllerMethod: 'register', serviceMethod: 'register', dto: 'RegisterDto' },
    { key: 'refresh', route: '/auth/refresh', controllerMethod: 'refresh', serviceMethod: 'refresh', dto: 'RefreshTokenDto' },
];

const requiredSessionUserKeys = [
    'id',
    'name',
    'email',
    'phone',
    'avatarUrl',
    'role',
    'twoFactorEnabled',
    'createdAt',
    'updatedAt',
];

async function main() {
    const findings = [];
    const warnings = [];
    const notes = [];

    const contents = await readFiles(files, findings);

    const riskMapChecks = inspectRiskMap(contents.riskMap);
    const frontendWrapperChecks = inspectAuthApi(contents.endpoints);
    const authContextChecks = inspectAuthContext(contents.authContext);
    const controllerChecks = inspectAuthController(contents.authController);
    const serviceChecks = inspectAuthService(contents.authService);
    const dtoChecks = inspectAuthDto(contents.authDto);
    const jsonApiChecks = inspectJsonApiResponseInterceptor(contents.jsonApiResponseInterceptor);

    if (!riskMapChecks.documentsAuthSessionShape) {
        warnings.push(warning(
            'docs/API_RESPONSE_SHAPE_RISK_MAP.md',
            'The response shape risk map does not appear to document auth session shape.',
            'Keep the risk map updated when auth response-shape checks evolve.',
        ));
    }

    for (const method of authMethods) {
        const wrapper = frontendWrapperChecks.methods[method.key];
        if (!wrapper?.exists) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `authApi.${method.key} was not detected.`,
                `Confirm the frontend wrapper for POST ${method.route} before changing auth response shape.`,
            ));
            continue;
        }

        if (!wrapper.callsExpectedPost) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `authApi.${method.key} does not appear to call api.post('${method.route}', ...).`,
                `POST ${method.route} response-shape checks should follow the actual wrapper route.`,
            ));
        }

        if (wrapper.transformsResponseData) {
            findings.push(finding(
                'apps/web/src/api/endpoints.ts',
                `authApi.${method.key} appears to transform response.data before returning.`,
                'AuthContext currently expects the raw AxiosResponse from the endpoint wrapper.',
            ));
        }

        const controller = controllerChecks.methods[method.key];
        if (!controller?.exposesExpectedPost) {
            findings.push(finding(
                'apps/api/src/auth/auth.controller.ts',
                `AuthController.${method.controllerMethod} does not appear to expose @Post('${method.route.replace('/auth/', '')}').`,
                'Confirm the auth route before relying on this static response-shape check.',
            ));
        }

        if (!controller?.delegatesToAuthService) {
            findings.push(finding(
                'apps/api/src/auth/auth.controller.ts',
                `AuthController.${method.controllerMethod} does not appear to delegate to authService.${method.serviceMethod}.`,
                'Trace the backend producer before changing auth session shape.',
            ));
        }

        const service = serviceChecks.methods[method.key];
        if (!service?.usesIssueAuthSession) {
            findings.push(finding(
                'apps/api/src/auth/auth.service.ts',
                `AuthService.${method.serviceMethod} does not appear to use issueAuthSession.`,
                'Keep login/register/refresh aligned around the shared auth session producer.',
            ));
        }

        const dto = dtoChecks.classes[method.dto];
        if (!dto) {
            warnings.push(warning(
                'apps/api/src/auth/dto/auth.dto.ts',
                `${method.dto} was not detected.`,
                'This check does not validate request DTO semantics, but missing DTOs can indicate route drift.',
            ));
        }
    }

    if (!authContextChecks.applySessionExpectsAccessToken || !authContextChecks.applySessionExpectsUser) {
        findings.push(finding(
            'apps/web/src/context/AuthContext.tsx',
            'applySession does not appear to expect both accessToken and user.',
            'Auth session consumers depend on { accessToken, user } at the root of response.data.',
        ));
    }

    if (!authContextChecks.loginConsumesRootSession) {
        findings.push(finding(
            'apps/web/src/context/AuthContext.tsx',
            'AuthContext.login does not appear to consume response.data.accessToken and response.data.user.',
            'Keep login aligned with the root auth session response shape.',
        ));
    }

    if (!authContextChecks.registerConsumesRootSession) {
        findings.push(finding(
            'apps/web/src/context/AuthContext.tsx',
            'AuthContext.register does not appear to consume response.data.accessToken and response.data.user.',
            'Keep register aligned with the root auth session response shape.',
        ));
    }

    if (!authContextChecks.refreshConsumesRootSession) {
        findings.push(finding(
            'apps/web/src/context/AuthContext.tsx',
            'AuthContext refresh flows do not appear to consume refreshResponse.data.accessToken and refreshResponse.data.user.',
            'Bootstrap and multi-tab session sync depend on the root auth session response shape.',
        ));
    }

    if (!controllerChecks.controllerPrefix) {
        findings.push(finding(
            'apps/api/src/auth/auth.controller.ts',
            'AuthController does not appear to use @Controller("auth").',
            'Confirm the auth route prefix before relying on this check.',
        ));
    }

    if (!serviceChecks.issueAuthSessionExists) {
        findings.push(finding(
            'apps/api/src/auth/auth.service.ts',
            'issueAuthSession was not detected.',
            'Auth session response shape should have a single backend producer.',
        ));
    }

    if (!serviceChecks.issueAuthSessionReturnsAccessToken) {
        findings.push(finding(
            'apps/api/src/auth/auth.service.ts',
            'issueAuthSession does not appear to return accessToken at the response root.',
            'AuthContext expects response.data.accessToken.',
        ));
    }

    if (!serviceChecks.issueAuthSessionReturnsUser) {
        findings.push(finding(
            'apps/api/src/auth/auth.service.ts',
            'issueAuthSession does not appear to return user at the response root.',
            'AuthContext expects response.data.user.',
        ));
    }

    for (const key of requiredSessionUserKeys) {
        if (!serviceChecks.issueAuthSessionUserKeys.has(key)) {
            warnings.push(warning(
                'apps/api/src/auth/auth.service.ts',
                `issueAuthSession user payload does not appear to include "${key}".`,
                'This check does not validate the complete User shape, but this field is part of the current session payload.',
            ));
        }
    }

    if (serviceChecks.loginAllowsSecurityWarnings) {
        notes.push('AuthService.login may add securityWarnings for admin accounts; this is an allowed extra and is not required by AuthContext.');
    }

    if (jsonApiChecks.hasJsonApiResponseEnabledToggle) {
        warnings.push(warning(
            'apps/api/src/core/interceptors/json-api-response.interceptor.ts',
            'JSON_API_RESPONSE_ENABLED toggle is present. If enabled, auth responses would likely move from response.data.accessToken/user to response.data.data.accessToken/user.',
            'Keep JSON_API_RESPONSE_ENABLED disabled until auth adapters and runtime contract tests exist.',
        ));
    }

    printReport({
        findings,
        warnings,
        notes,
        riskMapChecks,
        frontendWrapperChecks,
        authContextChecks,
        controllerChecks,
        serviceChecks,
        dtoChecks,
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
        documentsAuthSessionShape: /Auth session\s*\{accessToken,\s*user\}/.test(content)
            || /POST\s+\/auth\/login[\s\S]*accessToken[\s\S]*user/.test(content),
    };
}

function inspectAuthApi(content) {
    const authApiBlock = extractExportedObjectBlock(content, 'authApi');
    const methods = {};

    for (const method of authMethods) {
        const block = extractObjectMethodBlock(authApiBlock, method.key);
        methods[method.key] = {
            exists: block.length > 0,
            callsExpectedPost: new RegExp(`api\\.post\\(\\s*['"]${escapeRegExp(method.route)}['"]`).test(block),
            transformsResponseData: /(?:\.then\s*\(|response\.data|=>\s*[^;\n]*\.data\b)/.test(block),
        };
    }

    return { methods };
}

function inspectAuthContext(content) {
    const loginBlock = extractConstArrowFunctionBlock(content, 'login');
    const registerBlock = extractConstArrowFunctionBlock(content, 'register');
    const applySessionType = /const\s+applySession\s*=\s*useCallback\(\s*\(payload:\s*\{[\s\S]*?accessToken\s*:\s*string[\s\S]*?user\s*:\s*User[\s\S]*?\}/.test(content);

    return {
        applySessionExpectsAccessToken: applySessionType
            && /payload\.accessToken/.test(content),
        applySessionExpectsUser: applySessionType
            && /payload\.user/.test(content),
        loginConsumesRootSession: /authApi\.login\(/.test(loginBlock)
            && /const\s*\{\s*accessToken\s*,\s*user\s*:\s*userData\s*\}\s*=\s*response\.data/.test(loginBlock),
        registerConsumesRootSession: /authApi\.register\(/.test(registerBlock)
            && /const\s*\{\s*accessToken\s*,\s*user\s*:\s*userData\s*\}\s*=\s*response\.data/.test(registerBlock),
        refreshConsumesRootSession: /authApi\.refresh\(\)/.test(content)
            && /const\s*\{\s*accessToken\s*,\s*user\s*:\s*refreshedUser\s*\}\s*=\s*refreshResponse\.data/.test(content),
    };
}

function inspectAuthController(content) {
    const methods = {};
    for (const method of authMethods) {
        const block = extractMethodWithDecoratorsBlock(content, method.controllerMethod);
        const routeSuffix = method.route.replace('/auth/', '');
        methods[method.key] = {
            exposesExpectedPost: new RegExp(`@Post\\(\\s*['"]${escapeRegExp(routeSuffix)}['"]\\s*\\)`).test(block),
            delegatesToAuthService: new RegExp(`this\\.authService\\.${escapeRegExp(method.serviceMethod)}\\(`).test(block),
        };
    }

    return {
        controllerPrefix: /@Controller\(\s*['"]auth['"]\s*\)/.test(content),
        methods,
    };
}

function inspectAuthService(content) {
    const methods = {};
    for (const method of authMethods) {
        const block = extractMethodBlock(content, method.serviceMethod);
        methods[method.key] = {
            exists: block.length > 0,
            usesIssueAuthSession: /this\.issueAuthSession\(/.test(block),
        };
    }

    const issueAuthSessionBlock = extractMethodBlock(content, 'issueAuthSession');
    const returnObject = extractLastReturnedObject(issueAuthSessionBlock);
    const userObject = extractNestedObject(returnObject, 'user');

    return {
        methods,
        issueAuthSessionExists: issueAuthSessionBlock.length > 0,
        issueAuthSessionReturnsAccessToken: /(?:^|[,{\s])accessToken\s*,/.test(returnObject)
            || /accessToken\s*:/.test(returnObject),
        issueAuthSessionReturnsUser: /(?:^|[,{\s])user\s*:/.test(returnObject),
        issueAuthSessionUserKeys: new Set(extractObjectLiteralKeys(userObject)),
        loginAllowsSecurityWarnings: /securityWarnings\s*:/.test(methods.login?.exists ? extractMethodBlock(content, 'login') : ''),
    };
}

function inspectAuthDto(content) {
    const classes = {};
    for (const className of ['RegisterDto', 'LoginDto', 'RefreshTokenDto']) {
        classes[className] = new RegExp(`export\\s+class\\s+${escapeRegExp(className)}\\b`).test(content);
    }

    return { classes };
}

function inspectJsonApiResponseInterceptor(content) {
    return {
        hasJsonApiResponseEnabledToggle: /JSON_API_RESPONSE_ENABLED/.test(content),
        wrapsPayloadInData: /data\s*:\s*payload/.test(content),
    };
}

function extractLastReturnedObject(content) {
    let lastObject = '';
    const returnPattern = /return\s*\{/g;
    let match;

    while ((match = returnPattern.exec(content)) !== null) {
        const openBrace = content.indexOf('{', match.index);
        if (openBrace !== -1) {
            lastObject = extractBraceBlockFrom(content, openBrace);
        }
    }

    return lastObject;
}

function extractNestedObject(content, propertyName) {
    const pattern = new RegExp(`${escapeRegExp(propertyName)}\\s*:\\s*\\{`);
    const match = pattern.exec(content);
    if (!match) {
        return '';
    }

    const openBrace = content.indexOf('{', match.index);
    return openBrace === -1 ? '' : extractBraceBlockFrom(content, openBrace);
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

    const postDecoratorIndex = content.lastIndexOf('@Post(', methodMatch.index);
    const start = postDecoratorIndex === -1 ? methodMatch.index : postDecoratorIndex;
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

function extractConstArrowFunctionBlock(content, name) {
    const marker = `const ${name} =`;
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
    authContextChecks,
    controllerChecks,
    serviceChecks,
    dtoChecks,
    jsonApiChecks,
}) {
    console.log('[auth-response-shape-check] Report-only auth session response shape check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');

    console.log('Expected auth session response shape:');
    console.log('- accessToken: string');
    console.log('- user: object');
    console.log('- securityWarnings?: string[] (allowed extra)');
    console.log('');

    console.log('Frontend wrappers:');
    console.log(`- risk map documents auth session shape: ${formatBoolean(riskMapChecks.documentsAuthSessionShape)}`);
    for (const method of authMethods) {
        const wrapper = frontendWrapperChecks.methods[method.key];
        console.log(`- authApi.${method.key} exists: ${formatBoolean(wrapper?.exists)}`);
        console.log(`- authApi.${method.key} calls api.post('${method.route}', ...): ${formatBoolean(wrapper?.callsExpectedPost)}`);
        console.log(`- authApi.${method.key} transforms response.data: ${formatBoolean(wrapper?.transformsResponseData)}`);
    }
    console.log('');

    console.log('AuthContext consumer:');
    console.log(`- applySession expects accessToken: ${formatBoolean(authContextChecks.applySessionExpectsAccessToken)}`);
    console.log(`- applySession expects user: ${formatBoolean(authContextChecks.applySessionExpectsUser)}`);
    console.log(`- login consumes response.data accessToken/user: ${formatBoolean(authContextChecks.loginConsumesRootSession)}`);
    console.log(`- register consumes response.data accessToken/user: ${formatBoolean(authContextChecks.registerConsumesRootSession)}`);
    console.log(`- refresh consumes refreshResponse.data accessToken/user: ${formatBoolean(authContextChecks.refreshConsumesRootSession)}`);
    console.log('');

    console.log('Backend routes and producer:');
    console.log(`- AuthController @Controller('auth'): ${formatBoolean(controllerChecks.controllerPrefix)}`);
    for (const method of authMethods) {
        const controller = controllerChecks.methods[method.key];
        const service = serviceChecks.methods[method.key];
        console.log(`- AuthController.${method.controllerMethod} exposes @Post('${method.route.replace('/auth/', '')}'): ${formatBoolean(controller?.exposesExpectedPost)}`);
        console.log(`- AuthController.${method.controllerMethod} delegates to authService.${method.serviceMethod}: ${formatBoolean(controller?.delegatesToAuthService)}`);
        console.log(`- AuthService.${method.serviceMethod} uses issueAuthSession: ${formatBoolean(service?.usesIssueAuthSession)}`);
    }
    console.log(`- issueAuthSession exists: ${formatBoolean(serviceChecks.issueAuthSessionExists)}`);
    console.log(`- issueAuthSession returns accessToken at root: ${formatBoolean(serviceChecks.issueAuthSessionReturnsAccessToken)}`);
    console.log(`- issueAuthSession returns user at root: ${formatBoolean(serviceChecks.issueAuthSessionReturnsUser)}`);
    for (const key of requiredSessionUserKeys) {
        console.log(`- issueAuthSession user includes ${key}: ${formatBoolean(serviceChecks.issueAuthSessionUserKeys.has(key))}`);
    }
    console.log(`- login allows optional securityWarnings: ${formatBoolean(serviceChecks.loginAllowsSecurityWarnings)}`);
    console.log('');

    console.log('Request DTO presence (informational):');
    for (const dtoName of ['RegisterDto', 'LoginDto', 'RefreshTokenDto']) {
        console.log(`- ${dtoName}: ${formatBoolean(dtoChecks.classes[dtoName])}`);
    }
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
    console.error('[auth-response-shape-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
