import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-telemetry-growth-contract.mjs
// Scope: POST /telemetry/growth eventType values against TrackGrowthEventDto and GrowthEventType.

const projectRoot = process.cwd();

const files = {
    endpoints: path.join(projectRoot, 'apps', 'web', 'src', 'api', 'endpoints.ts'),
    eventTrackingController: path.join(projectRoot, 'apps', 'api', 'src', 'analytics', 'event-tracking.controller.ts'),
    analyticsDto: path.join(projectRoot, 'apps', 'api', 'src', 'analytics', 'dto', 'analytics.dto.ts'),
    prismaSchema: path.join(projectRoot, 'apps', 'api', 'prisma', 'schema.prisma'),
};

async function main() {
    const [
        endpoints,
        eventTrackingController,
        analyticsDto,
        prismaSchema,
    ] = await Promise.all([
        readFile(files.endpoints),
        readFile(files.eventTrackingController),
        readFile(files.analyticsDto),
        readFile(files.prismaSchema),
    ]);

    const frontendContract = extractFrontendTrackGrowthEventContract(endpoints);
    const backendGrowthEventTypes = extractPrismaEnumValues(prismaSchema, 'GrowthEventType');
    const controllerAliases = extractControllerAliases(eventTrackingController);
    const hasGrowthPostRoute = hasPostRoute(eventTrackingController, 'growth');
    const dtoChecks = inspectTrackGrowthEventDto(analyticsDto);
    const findings = [];
    const notes = [];

    if (!frontendContract.route) {
        findings.push('analyticsApi.trackGrowthEvent route could not be found in endpoints.ts.');
    } else if (frontendContract.route !== '/telemetry/growth') {
        findings.push(`analyticsApi.trackGrowthEvent posts to "${frontendContract.route}", expected "/telemetry/growth".`);
    }

    if (frontendContract.eventTypes.size === 0) {
        findings.push('No frontend eventType literals were found for analyticsApi.trackGrowthEvent.');
    }

    if (backendGrowthEventTypes.size === 0) {
        findings.push('No backend GrowthEventType enum values were found in Prisma schema.');
    }

    for (const eventType of frontendContract.eventTypes) {
        if (!backendGrowthEventTypes.has(eventType)) {
            findings.push(`Frontend eventType "${eventType}" is not present in backend GrowthEventType.`);
        }
    }

    for (const eventType of backendGrowthEventTypes) {
        if (!frontendContract.eventTypes.has(eventType)) {
            findings.push(`Backend GrowthEventType "${eventType}" is not present in analyticsApi.trackGrowthEvent.`);
        }
    }

    if (!controllerAliases.has('telemetry')) {
        findings.push('event-tracking.controller.ts does not expose the "telemetry" controller alias.');
    }

    if (!hasGrowthPostRoute) {
        findings.push('event-tracking.controller.ts does not expose @Post("growth").');
    }

    if (!dtoChecks.importsGrowthEventType) {
        findings.push('analytics.dto.ts does not import GrowthEventType.');
    }

    if (!dtoChecks.usesIsEnumGrowthEventType) {
        findings.push('TrackGrowthEventDto does not appear to validate eventType with @IsEnum(GrowthEventType).');
    }

    if (!dtoChecks.typesEventTypeAsGrowthEventType) {
        findings.push('TrackGrowthEventDto.eventType does not appear to be typed as GrowthEventType.');
    }

    if (controllerAliases.has('telemetry') && hasGrowthPostRoute) {
        notes.push('Route alias is currently aligned: @Controller includes "telemetry" and @Post("growth") exists.');
    }

    if (frontendContract.route === '/telemetry/growth') {
        notes.push('Frontend route is currently aligned: analyticsApi.trackGrowthEvent posts to /telemetry/growth.');
    }

    if (
        frontendContract.eventTypes.size > 0
        && backendGrowthEventTypes.size > 0
        && setsAreEqual(frontendContract.eventTypes, backendGrowthEventTypes)
    ) {
        notes.push('Frontend eventType literals match backend GrowthEventType values.');
    }

    if (dtoChecks.usesIsEnumGrowthEventType && dtoChecks.typesEventTypeAsGrowthEventType) {
        notes.push('TrackGrowthEventDto currently validates and types eventType with GrowthEventType.');
    }

    printReport({
        frontendRoute: frontendContract.route,
        frontendEventTypes: frontendContract.eventTypes,
        backendGrowthEventTypes,
        controllerAliases,
        hasGrowthPostRoute,
        dtoChecks,
        findings,
        notes,
    });
}

async function readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

function extractFrontendTrackGrowthEventContract(content) {
    const routeMatch = content.match(
        /trackGrowthEvent:\s*\(data:\s*\{([\s\S]*?)\}\)\s*=>\s*api\.post\(\s*['"]([^'"]+)['"]\s*,\s*data\s*\)/,
    );

    if (!routeMatch) {
        return {
            route: '',
            eventTypes: new Set(),
        };
    }

    const dataBlock = routeMatch[1];
    const route = routeMatch[2];
    const eventTypeMatch = dataBlock.match(/eventType:\s*([\s\S]*?);/);
    const eventTypes = eventTypeMatch ? extractStringLiteralSet(eventTypeMatch[1]) : new Set();

    return {
        route,
        eventTypes,
    };
}

function extractPrismaEnumValues(content, enumName) {
    const enumMatch = content.match(new RegExp(`enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`));
    if (!enumMatch) {
        return new Set();
    }

    const values = enumMatch[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('@'))
        .map((line) => line.split(/\s+/)[0])
        .filter(Boolean);

    return new Set(values);
}

function extractControllerAliases(content) {
    const controllerMatch = content.match(/@Controller\(\s*(\[[\s\S]*?\]|['"][^'"]+['"])\s*\)/);
    if (!controllerMatch) {
        return new Set();
    }

    return extractStringLiteralSet(controllerMatch[1]);
}

function hasPostRoute(content, routeName) {
    const escapedRoute = escapeRegExp(routeName);
    return new RegExp(`@Post\\(\\s*['"]${escapedRoute}['"]\\s*\\)`).test(content);
}

function inspectTrackGrowthEventDto(content) {
    const classBlock = extractClassBlock(content, 'TrackGrowthEventDto');
    return {
        importsGrowthEventType: /import\s*\{[^}]*\bGrowthEventType\b[^}]*\}\s*from\s*['"][^'"]+['"]/.test(content),
        usesIsEnumGrowthEventType: /@IsEnum\(\s*GrowthEventType\s*\)/.test(classBlock),
        typesEventTypeAsGrowthEventType: /\beventType!?\s*:\s*GrowthEventType\s*;/.test(classBlock),
    };
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

function extractStringLiteralSet(source) {
    const values = new Set();
    const stringLiteralPattern = /['"]([^'"]+)['"]/g;
    let match;

    while ((match = stringLiteralPattern.exec(source)) !== null) {
        values.add(match[1]);
    }

    return values;
}

function setsAreEqual(left, right) {
    if (left.size !== right.size) {
        return false;
    }

    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }

    return true;
}

function printReport({
    frontendRoute,
    frontendEventTypes,
    backendGrowthEventTypes,
    controllerAliases,
    hasGrowthPostRoute,
    dtoChecks,
    findings,
    notes,
}) {
    console.log('[telemetry-growth-contract-check] Report-only POST /telemetry/growth contract check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');
    console.log(`Frontend route: ${frontendRoute || '(not found)'}`);
    console.log(`Controller aliases: ${formatSet(controllerAliases)}`);
    console.log(`Controller @Post("growth"): ${hasGrowthPostRoute ? 'found' : 'not found'}`);
    console.log(`TrackGrowthEventDto imports GrowthEventType: ${formatBoolean(dtoChecks.importsGrowthEventType)}`);
    console.log(`TrackGrowthEventDto validates @IsEnum(GrowthEventType): ${formatBoolean(dtoChecks.usesIsEnumGrowthEventType)}`);
    console.log(`TrackGrowthEventDto eventType typed as GrowthEventType: ${formatBoolean(dtoChecks.typesEventTypeAsGrowthEventType)}`);
    console.log('');
    console.log(`Frontend eventType values (${frontendEventTypes.size}): ${formatSet(frontendEventTypes)}`);
    console.log(`Backend GrowthEventType values (${backendGrowthEventTypes.size}): ${formatSet(backendGrowthEventTypes)}`);
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
    console.error('[telemetry-growth-contract-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
