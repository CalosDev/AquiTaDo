import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-auth-org-routes.mjs
// Scope: protected backend/frontend auth, role, and organization-context route map.

const projectRoot = process.cwd();

const fixedFiles = {
    riskMap: path.join(projectRoot, 'docs', 'AUTH_ORG_CONTEXT_RISK_MAP.md'),
    protectedRoute: path.join(projectRoot, 'apps', 'web', 'src', 'components', 'ProtectedRoute.tsx'),
    frontendRouter: path.join(projectRoot, 'apps', 'web', 'src', 'routes', 'Router.tsx'),
    acceptOrganizationInvite: path.join(projectRoot, 'apps', 'web', 'src', 'pages', 'AcceptOrganizationInvite.tsx'),
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    frontendRoles: path.join(projectRoot, 'apps', 'web', 'src', 'auth', 'roles.ts'),
    frontendCapabilities: path.join(projectRoot, 'apps', 'web', 'src', 'auth', 'capabilities.ts'),
    authContext: path.join(projectRoot, 'apps', 'web', 'src', 'context', 'AuthContext.tsx'),
    organizationContext: path.join(projectRoot, 'apps', 'web', 'src', 'context', 'OrganizationContext.tsx'),
    apiClient: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'client.ts'),
};

const controllerRoot = path.join(projectRoot, 'apps', 'api', 'src');
const authGuardRoot = path.join(projectRoot, 'apps', 'api', 'src', 'auth', 'guards');
const authDecoratorRoot = path.join(projectRoot, 'apps', 'api', 'src', 'auth', 'decorators');
const organizationGuardRoot = path.join(projectRoot, 'apps', 'api', 'src', 'organizations', 'guards');
const organizationDecoratorRoot = path.join(projectRoot, 'apps', 'api', 'src', 'organizations', 'decorators');
const authorizationRoot = path.join(projectRoot, 'apps', 'api', 'src', 'core', 'authorization');

const httpDecorators = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const roleSensitiveAuthenticatedOnlyRoutes = new Set(['/app/invite']);

async function main() {
    const [
        controllerFiles,
        supportFiles,
    ] = await Promise.all([
        listFiles(controllerRoot, (filePath) => filePath.endsWith('.controller.ts')),
        collectSupportFiles(),
    ]);

    const fixedContents = await readNamedFiles(fixedFiles);
    const controllerContents = await readFileList(controllerFiles);
    const supportContents = await readFileList(supportFiles);

    const backendRoutes = controllerContents.flatMap(({ filePath, content }) =>
        parseController(filePath, content));
    const frontendRoutes = parseFrontendRoutes(fixedContents.frontendRouter?.content ?? '');
    const appInviteContract = inspectAppInviteStaticContract({
        fixedContents,
        supportContents,
        backendRoutes,
        frontendRoutes,
    });
    const findings = [
        ...inspectBackendRisks(backendRoutes),
        ...inspectFrontendRisks(frontendRoutes),
        ...appInviteContract.findings,
        ...inspectGlobalOrgHeader(fixedContents.apiClient?.content ?? ''),
    ];
    const notes = [
        ...inspectSourceSignals({
            fixedContents,
            supportContents,
            backendRoutes,
            frontendRoutes,
        }),
        ...appInviteContract.notes,
    ];

    printReport({
        filesRead: [
            ...Object.values(fixedContents).map((entry) => entry.filePath),
            ...controllerFiles,
            ...supportFiles,
        ],
        backendRoutes,
        frontendRoutes,
        findings,
        notes,
    });
}

async function collectSupportFiles() {
    const groups = await Promise.all([
        listFiles(authGuardRoot, (filePath) => filePath.endsWith('.ts')),
        listFiles(authDecoratorRoot, (filePath) => path.basename(filePath) === 'roles.decorator.ts'),
        listFiles(organizationGuardRoot, (filePath) => filePath.endsWith('.ts')),
        listFiles(organizationDecoratorRoot, (filePath) => filePath.endsWith('.ts')),
        listFiles(authorizationRoot, (filePath) => filePath.endsWith('.ts')),
    ]);

    return unique(groups.flat());
}

async function listFiles(root, predicate) {
    if (!(await exists(root))) {
        return [];
    }

    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(fullPath, predicate));
        } else if (predicate(fullPath)) {
            files.push(fullPath);
        }
    }

    return files.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

async function readNamedFiles(fileMap) {
    const entries = await Promise.all(
        Object.entries(fileMap).map(async ([key, filePath]) => {
            if (!(await exists(filePath))) {
                return [key, null];
            }
            return [key, { filePath, content: await fs.readFile(filePath, 'utf8') }];
        }),
    );

    return Object.fromEntries(entries.filter(([, value]) => value !== null));
}

async function readFileList(filePaths) {
    const entries = await Promise.all(
        filePaths.map(async (filePath) => ({
            filePath,
            content: await fs.readFile(filePath, 'utf8'),
        })),
    );
    return entries;
}

async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function parseController(filePath, content) {
    const lines = content.split(/\r?\n/);
    const classLineIndex = lines.findIndex((line) => /\bexport\s+class\s+\w+/.test(line));
    const className = extractFirst(content, /\bexport\s+class\s+(\w+)/) ?? path.basename(filePath, '.ts');
    const classDecoratorText = classLineIndex === -1
        ? ''
        : lines.slice(Math.max(0, findClassDecoratorStart(lines, classLineIndex)), classLineIndex).join('\n');
    const classDecorators = extractDecoratorLines(classDecoratorText);
    const controllerPaths = parseControllerPaths(classDecorators);
    const classGuards = extractDecoratorValues(classDecorators, 'UseGuards');
    const classRoles = extractStringDecoratorValues(classDecorators, 'Roles');
    const classOrgRoles = extractStringDecoratorValues(classDecorators, 'OrgRoles');
    const methodCandidates = collectRouteMethodCandidates(lines, classLineIndex);

    return methodCandidates.map((candidate, index) => {
        const nextCandidate = methodCandidates[index + 1];
        const methodText = lines.slice(candidate.methodLineIndex, nextCandidate?.decoratorStartLineIndex ?? lines.length).join('\n');
        const methodGuards = extractDecoratorValues(candidate.decorators, 'UseGuards');
        const methodRoles = extractStringDecoratorValues(candidate.decorators, 'Roles');
        const methodOrgRoles = extractStringDecoratorValues(candidate.decorators, 'OrgRoles');
        const guards = unique([...classGuards, ...methodGuards]);
        const roles = methodRoles.length > 0 ? methodRoles : classRoles;
        const orgRoles = methodOrgRoles.length > 0 ? methodOrgRoles : classOrgRoles;
        const routePaths = combineRoutes(controllerPaths, candidate.paths);
        const hasCurrentOrganization = /@CurrentOrganization\s*\(/.test(methodText);

        return {
            filePath,
            controllerName: className,
            methodName: candidate.methodName,
            httpMethod: candidate.httpMethod.toUpperCase(),
            routePaths,
            guards,
            roles,
            orgRoles,
            orgContext: resolveOrgContext(guards),
            hasCurrentOrganization,
            hasRolesDecorator: roles.length > 0,
            hasOrgRolesDecorator: orgRoles.length > 0,
        };
    });
}

function findClassDecoratorStart(lines, classLineIndex) {
    let start = classLineIndex;
    for (let index = classLineIndex - 1; index >= 0; index -= 1) {
        const trimmed = lines[index].trim();
        if (trimmed.startsWith('@') || trimmed === '' || trimmed.startsWith('//')) {
            start = index;
            continue;
        }
        break;
    }
    return start;
}

function extractDecoratorLines(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('@'));
}

function collectRouteMethodCandidates(lines, classLineIndex) {
    const candidates = [];
    let pendingDecorators = [];
    let pendingStartLineIndex = null;
    let insideMethod = false;
    let methodDepth = 0;
    let methodBodyEntered = false;

    for (let index = Math.max(0, classLineIndex + 1); index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();

        if (insideMethod) {
            const braceDelta = countChar(line, '{') - countChar(line, '}');
            methodDepth += braceDelta;
            if (line.includes('{')) {
                methodBodyEntered = true;
            }
            if (methodBodyEntered && methodDepth <= 0) {
                insideMethod = false;
                methodDepth = 0;
                methodBodyEntered = false;
            }
            continue;
        }

        if (trimmed.startsWith('@')) {
            if (pendingDecorators.length === 0) {
                pendingStartLineIndex = index;
            }
            pendingDecorators.push(trimmed);
            continue;
        }

        const methodName = extractFirst(line, /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
        const routeDecorator = pendingDecorators.find((decorator) => parseHttpDecorator(decorator));

        if (methodName && routeDecorator) {
            const parsedRoute = parseHttpDecorator(routeDecorator);
            candidates.push({
                decorators: pendingDecorators,
                decoratorStartLineIndex: pendingStartLineIndex ?? index,
                methodLineIndex: index,
                methodName,
                httpMethod: parsedRoute.method,
                paths: parsedRoute.paths,
            });
            pendingDecorators = [];
            pendingStartLineIndex = null;
            insideMethod = true;
            methodDepth = countChar(line, '{') - countChar(line, '}');
            methodBodyEntered = line.includes('{');
            if (methodBodyEntered && methodDepth <= 0) {
                insideMethod = false;
                methodDepth = 0;
                methodBodyEntered = false;
            }
            continue;
        }
    }

    return candidates;
}

function parseHttpDecorator(decorator) {
    const match = decorator.match(/^@(Get|Post|Put|Patch|Delete)\s*(?:\(([\s\S]*)\))?/);
    if (!match || !httpDecorators.has(match[1])) {
        return null;
    }
    return {
        method: match[1],
        paths: parseDecoratorPathValues(match[2] ?? ''),
    };
}

function parseControllerPaths(decorators) {
    const controllerDecorator = decorators.find((decorator) => decorator.startsWith('@Controller'));
    if (!controllerDecorator) {
        return [''];
    }
    const args = extractDecoratorArgs(controllerDecorator, 'Controller') ?? '';
    return parseDecoratorPathValues(args);
}

function parseDecoratorPathValues(args) {
    const values = [];
    const stringPattern = /['"]([^'"]*)['"]/g;
    let match;

    while ((match = stringPattern.exec(args)) !== null) {
        values.push(match[1]);
    }

    return values.length > 0 ? values : [''];
}

function extractDecoratorValues(decorators, decoratorName) {
    return unique(decorators.flatMap((decorator) => {
        const args = extractDecoratorArgs(decorator, decoratorName);
        if (!args) {
            return [];
        }
        return args
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    }));
}

function extractStringDecoratorValues(decorators, decoratorName) {
    return unique(decorators.flatMap((decorator) => {
        const args = extractDecoratorArgs(decorator, decoratorName);
        if (!args) {
            return [];
        }
        return [...args.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
    }));
}

function extractDecoratorArgs(decorator, decoratorName) {
    const match = decorator.match(new RegExp(`^@${escapeRegExp(decoratorName)}\\s*\\((.*)\\)`));
    return match?.[1] ?? null;
}

function combineRoutes(basePaths, methodPaths) {
    return basePaths.flatMap((basePath) =>
        methodPaths.map((methodPath) => joinRoute(basePath, methodPath)));
}

function joinRoute(basePath, methodPath) {
    const raw = [basePath, methodPath]
        .filter((segment) => segment !== undefined && segment !== null && String(segment).length > 0)
        .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/');
    return `/${raw}`;
}

function resolveOrgContext(guards) {
    if (guards.includes('OrgContextGuard')) {
        return 'required';
    }
    if (guards.includes('OptionalOrgContextGuard')) {
        return 'optional';
    }
    return 'none';
}

function parseFrontendRoutes(content) {
    const routePaths = new Set([...content.matchAll(/<Route\b[\s\S]*?\bpath="([^"]+)"/g)].map((match) => match[1]));
    const protectedRoutes = new Map();
    const protectedGroupPattern = /<Route\s+element=\{\s*<ProtectedRoute([\s\S]*?)<\/ProtectedRoute>\s*\}\s*>\s*([\s\S]*?)<\/Route>/g;
    let groupMatch;

    while ((groupMatch = protectedGroupPattern.exec(content)) !== null) {
        const groupOpening = groupMatch[1];
        const groupContent = groupMatch[2];
        const groupRoles = extractRolesFromProtectedRouteSource(groupOpening);
        const pathPattern = /<Route\b[\s\S]*?\bpath="([^"]+)"[\s\S]*?\/>/g;
        let routeMatch;

        while ((routeMatch = pathPattern.exec(groupContent)) !== null) {
            const routeSource = routeMatch[0];
            const routePath = routeMatch[1];
            const routeRoles = extractRolesFromProtectedRouteSource(routeSource);
            const roles = routeRoles ?? groupRoles;
            const protection = roles ? 'role-gated' : 'authenticated-only';
            protectedRoutes.set(routePath, {
                path: routePath,
                protection,
                roles: roles ?? [],
                unauthenticatedRedirect: '/login',
                unauthorizedRedirect: roles ? extractUnauthorizedRedirect(routeSource) ?? 'resolveRoleHomePath(user.role)' : '(none)',
            });
        }
    }

    return [...routePaths].sort((left, right) => left.localeCompare(right)).map((routePath) => {
        const protectedRoute = protectedRoutes.get(routePath);
        if (protectedRoute) {
            return protectedRoute;
        }
        return {
            path: routePath,
            protection: 'public',
            roles: [],
            unauthenticatedRedirect: '(none)',
            unauthorizedRedirect: '(none)',
        };
    });
}

function extractRolesFromProtectedRouteSource(source) {
    const rolesMatch = source.match(/roles=\{\[([^\]]*)\]\}/);
    if (!rolesMatch) {
        return null;
    }
    return [...rolesMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function extractUnauthorizedRedirect(source) {
    return extractFirst(source, /unauthorizedRedirectTo=\{?["']([^"'}]+)["']\}?/);
}

function inspectBackendRisks(routes) {
    const findings = [];

    for (const route of routes) {
        const hasJwtAuthGuard = route.guards.includes('JwtAuthGuard');
        const hasRolesGuard = route.guards.includes('RolesGuard');
        const hasRoles = route.roles.length > 0;
        const hasOrgContextGuard = route.guards.includes('OrgContextGuard');
        const hasAnyOrgContextGuard = hasOrgContextGuard || route.guards.includes('OptionalOrgContextGuard');
        const hasOrgRolesGuard = route.guards.includes('OrgRolesGuard');
        const hasOptionalAuthAndOrg = route.guards.includes('OptionalJwtAuthGuard')
            && route.guards.includes('OptionalOrgContextGuard');

        if (hasRolesGuard && !hasJwtAuthGuard) {
            findings.push(backendFinding('high', route, 'RolesGuard without JwtAuthGuard.'));
        }
        if (hasRoles && !hasRolesGuard) {
            findings.push(backendFinding('high', route, '@Roles without RolesGuard.'));
        }
        if (hasOrgRolesGuard && !hasOrgContextGuard) {
            findings.push(backendFinding('high', route, 'OrgRolesGuard without OrgContextGuard.'));
        }
        if (hasOrgContextGuard && !hasJwtAuthGuard) {
            findings.push(backendFinding('high', route, 'OrgContextGuard without JwtAuthGuard.'));
        }
        if (route.hasCurrentOrganization && !hasAnyOrgContextGuard) {
            findings.push(backendFinding('medium', route, 'CurrentOrganization without OrgContextGuard or OptionalOrgContextGuard.'));
        }
        if (hasOptionalAuthAndOrg) {
            findings.push(backendFinding('info', route, 'OptionalJwtAuthGuard + OptionalOrgContextGuard; invalid auth can degrade to anonymous optional context.'));
        }
    }

    return findings;
}

function inspectFrontendRisks(routes) {
    return routes
        .filter((route) => route.protection === 'authenticated-only' && roleSensitiveAuthenticatedOnlyRoutes.has(route.path))
        .map((route) => ({
            risk: 'medium',
            layer: 'frontend',
            route: route.path,
            message: 'Authenticated-only frontend route may clash with backend role restrictions.',
            recommendation: 'Characterize current behavior before changing frontend roles or backend @Roles.',
        }));
}

function inspectAppInviteStaticContract({
    fixedContents,
    supportContents,
    backendRoutes,
    frontendRoutes,
}) {
    const findings = [];
    const appInvite = frontendRoutes.find((route) => route.path === '/app/invite');
    const notes = ['App invite static contract:'];
    const acceptInviteContent = fixedContents.acceptOrganizationInvite?.content ?? '';
    const endpointsContent = fixedContents.endpoints?.content ?? '';
    const rolesContent = fixedContents.frontendRoles?.content ?? '';
    const supportText = supportContents.map((entry) => entry.content).join('\n');
    const backendRoute = backendRoutes.find((route) =>
        route.httpMethod === 'POST'
        && route.routePaths.includes('/organizations/invites/:token/accept'));
    const allFrontendRoles = extractAllUserRoles(rolesContent);
    const frontendAllowedRoles = appInvite?.protection === 'authenticated-only'
        ? allFrontendRoles
        : appInvite?.roles ?? [];
    const acceptPageUsesApi = /organizationApi\.acceptInvite\s*\(/.test(acceptInviteContent);
    const endpointPointsToAcceptRoute = /acceptInvite\s*:\s*\(\s*token\s*:\s*string\s*\)\s*=>\s*api\.post\(\s*`\/organizations\/invites\/\$\{token\}\/accept`\s*\)/.test(endpointsContent);
    const hasJwtAuthGuard = backendRoute?.guards.includes('JwtAuthGuard') ?? false;
    const hasRolesGuard = backendRoute?.guards.includes('RolesGuard') ?? false;
    const allowedBackendRoles = backendRoute?.roles ?? [];
    const allowsExpectedBackendRoles = allowedBackendRoles.includes('USER')
        && allowedBackendRoles.includes('BUSINESS_OWNER');
    const excludesAdminBackend = !allowedBackendRoles.includes('ADMIN');
    const rolesGuardUsesOverride = /getAllAndOverride\s*(?:<|\()/.test(supportText);
    const frontendIncludesAdmin = frontendAllowedRoles.includes('ADMIN');

    addContractSignal({
        notes,
        findings,
        ok: Boolean(appInvite),
        risk: 'high',
        route: '/app/invite',
        message: '/app/invite route not found in Router.tsx.',
        passNote: '/app/invite route found in Router.tsx.',
    });
    addContractSignal({
        notes,
        findings,
        ok: appInvite?.protection === 'role-gated'
            && frontendAllowedRoles.includes('USER')
            && frontendAllowedRoles.includes('BUSINESS_OWNER')
            && !frontendAllowedRoles.includes('ADMIN'),
        risk: 'medium',
        route: '/app/invite',
        message: '/app/invite is not protected by ProtectedRoute with explicit USER and BUSINESS_OWNER roles.',
        passNote: '/app/invite is protected by ProtectedRoute with explicit USER and BUSINESS_OWNER roles.',
    });
    addContractSignal({
        notes,
        findings,
        ok: acceptPageUsesApi,
        risk: 'high',
        route: '/app/invite',
        message: 'AcceptOrganizationInvite does not call organizationApi.acceptInvite.',
        passNote: 'AcceptOrganizationInvite uses organizationApi.acceptInvite.',
    });
    addContractSignal({
        notes,
        findings,
        ok: endpointPointsToAcceptRoute,
        risk: 'high',
        route: 'organizationApi.acceptInvite',
        message: 'organizationApi.acceptInvite does not point to POST /organizations/invites/${token}/accept.',
        passNote: 'organizationApi.acceptInvite points to POST /organizations/invites/${token}/accept.',
    });
    addContractSignal({
        notes,
        findings,
        ok: Boolean(backendRoute),
        risk: 'high',
        route: 'POST /organizations/invites/:token/accept',
        message: 'OrganizationsController does not expose @Post("invites/:token/accept").',
        passNote: 'OrganizationsController exposes @Post("invites/:token/accept").',
    });
    addContractSignal({
        notes,
        findings,
        ok: hasJwtAuthGuard && hasRolesGuard,
        risk: 'high',
        route: 'POST /organizations/invites/:token/accept',
        message: 'Invite accept endpoint does not have both JwtAuthGuard and RolesGuard.',
        passNote: 'Invite accept endpoint uses JwtAuthGuard and RolesGuard.',
    });
    addContractSignal({
        notes,
        findings,
        ok: allowsExpectedBackendRoles,
        risk: 'high',
        route: 'POST /organizations/invites/:token/accept',
        message: 'Invite accept endpoint does not allow both USER and BUSINESS_OWNER.',
        passNote: 'Invite accept endpoint allows USER and BUSINESS_OWNER.',
    });
    addContractSignal({
        notes,
        findings,
        ok: rolesGuardUsesOverride,
        risk: 'medium',
        route: 'RolesGuard',
        message: 'RolesGuard does not appear to use getAllAndOverride.',
        passNote: 'RolesGuard uses getAllAndOverride for handler-over-class role metadata.',
    });

    if (appInvite?.protection === 'authenticated-only' && frontendIncludesAdmin && excludesAdminBackend) {
        findings.push({
            risk: 'medium',
            layer: 'frontend/backend',
            route: '/app/invite -> POST /organizations/invites/:token/accept',
            message: 'Static mismatch: frontend authenticated-only includes ADMIN, but backend accept invite excludes ADMIN and allows USER, BUSINESS_OWNER.',
            recommendation: 'Keep report-only; the e2e/API characterization is still needed to validate runtime 403/404 behavior.',
        });
        notes.push('Mismatch confirmed: frontend authenticated-only includes ADMIN; backend accept invite excludes ADMIN.');
    } else if (
        appInvite?.protection === 'role-gated'
        && frontendAllowedRoles.includes('USER')
        && frontendAllowedRoles.includes('BUSINESS_OWNER')
        && !frontendIncludesAdmin
        && excludesAdminBackend
    ) {
        notes.push('App invite frontend roles align with backend invite accept roles: USER and BUSINESS_OWNER only; ADMIN excluded.');
    }

    return { findings, notes };
}

function addContractSignal({
    notes,
    findings,
    ok,
    risk,
    route,
    message,
    passNote,
}) {
    if (ok) {
        notes.push(passNote);
        return;
    }

    findings.push({
        risk,
        layer: 'frontend/backend',
        route,
        message,
        recommendation: 'Review static auth/org contract before changing runtime behavior.',
    });
}

function extractAllUserRoles(content) {
    const explicitRoles = extractFirst(content, /ALL_USER_ROLES\s*:\s*ReadonlyArray<[^>]+>\s*=\s*\[([^\]]+)\]/);
    if (explicitRoles) {
        const roles = [...explicitRoles.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
        if (roles.length > 0) {
            return unique(roles);
        }
    }

    const typeRoles = extractFirst(content, /type\s+UserRole\s*=\s*([^;]+)/);
    if (typeRoles) {
        const roles = [...typeRoles.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
        if (roles.length > 0) {
            return unique(roles);
        }
    }

    return ['USER', 'BUSINESS_OWNER', 'ADMIN'];
}

function inspectGlobalOrgHeader(apiClientContent) {
    const findings = [];
    if (
        /localStorage\.getItem\(\s*['"]activeOrganizationId['"]\s*\)/.test(apiClientContent)
        && /headers\[['"]x-organization-id['"]\]/.test(apiClientContent)
    ) {
        findings.push({
            risk: 'info',
            layer: 'frontend',
            route: 'api client',
            message: 'api/client.ts injects x-organization-id globally from localStorage.activeOrganizationId.',
            recommendation: 'Keep visible as an org-context drift risk; do not change behavior without characterization.',
        });
    }
    return findings;
}

function inspectSourceSignals({
    fixedContents,
    supportContents,
    backendRoutes,
    frontendRoutes,
}) {
    const notes = [];
    const supportText = supportContents.map((entry) => entry.content).join('\n');
    const protectedRouteContent = fixedContents.protectedRoute?.content ?? '';
    const organizationContextContent = fixedContents.organizationContext?.content ?? '';

    notes.push(`Backend routes mapped: ${backendRoutes.length}`);
    notes.push(`Frontend routes mapped: ${frontendRoutes.length}`);

    if (/ROLES_KEY/.test(supportText)) {
        notes.push('Roles decorator metadata source detected.');
    }
    if (/ORG_ROLES_KEY/.test(supportText)) {
        notes.push('Org roles decorator metadata source detected.');
    }
    if (/resolveRoleHomePath\(user\.role\)/.test(protectedRouteContent)) {
        notes.push('ProtectedRoute redirects unauthorized roles via resolveRoleHomePath(user.role).');
    }
    if (/activeOrganizationId/.test(organizationContextContent)) {
        notes.push('OrganizationContext manages activeOrganizationId in frontend state/storage.');
    }

    return notes;
}

function backendFinding(risk, route, message) {
    return {
        risk,
        layer: 'backend',
        route: `${route.httpMethod} ${formatRoutePaths(route.routePaths)}`,
        controller: `${route.controllerName}.${route.methodName}`,
        message,
        recommendation: 'Review guard composition before changing auth, roles, or organization context.',
    };
}

function printReport({
    filesRead,
    backendRoutes,
    frontendRoutes,
    findings,
    notes,
}) {
    console.log('[auth-org-routes-check] Report-only auth/org route map');
    console.log('');
    console.log(`Files read (${unique(filesRead).length}):`);
    for (const filePath of unique(filesRead).sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)))) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');
    console.log('Backend route map:');
    for (const route of backendRoutes) {
        console.log(`- ${route.httpMethod} ${formatRoutePaths(route.routePaths)} -> ${route.controllerName}.${route.methodName}`);
        console.log(`  guards: ${formatList(route.guards)}`);
        console.log(`  roles: ${formatList(route.roles)}`);
        console.log(`  org roles: ${formatList(route.orgRoles)}`);
        console.log(`  org context: ${route.orgContext}`);
    }
    console.log('');
    console.log('Frontend route map:');
    for (const route of frontendRoutes) {
        console.log(`- ${route.path} -> ${route.protection}`);
        console.log(`  roles allowed: ${formatList(route.roles)}`);
        console.log(`  unauthenticated redirect: ${route.unauthenticatedRedirect}`);
        console.log(`  unauthorized redirect: ${route.unauthorizedRedirect}`);
    }
    console.log('');

    if (findings.length > 0) {
        console.log(`Findings (${findings.length}):`);
        for (const finding of findings) {
            const location = finding.controller
                ? `${finding.route} -> ${finding.controller}`
                : `${finding.layer}: ${finding.route}`;
            console.log(`- [${finding.risk.toUpperCase()}] ${location}: ${finding.message}`);
            console.log(`  Recommendation: ${finding.recommendation}`);
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
    console.log('Report-only mode: findings do not change exit code and this script is not wired into CI.');
}

function formatRoutePaths(routePaths) {
    return routePaths.join(', ');
}

function formatList(values) {
    return values.length > 0 ? values.join(', ') : '(none)';
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

function unique(values) {
    return [...new Set(values)];
}

function extractFirst(content, pattern) {
    return content.match(pattern)?.[1] ?? null;
}

function countChar(value, char) {
    return [...value].filter((current) => current === char).length;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
    console.error('[auth-org-routes-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
