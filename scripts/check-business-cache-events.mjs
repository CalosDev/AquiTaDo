import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-business-cache-events.mjs
// Scope: business mutations that change public fields and should publish business.changed.

const projectRoot = process.cwd();

const files = {
    cacheMap: path.join(projectRoot, 'docs', 'BUSINESS_CACHE_INVALIDATION_MAP.md'),
    businessesService: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'businesses.service.ts'),
    claimCreationHelpers: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'business-claim-creation.helpers.ts'),
    domainEventsService: path.join(projectRoot, 'apps', 'api', 'src', 'core', 'events', 'domain-events.service.ts'),
    businessProjectionListener: path.join(projectRoot, 'apps', 'api', 'src', 'businesses', 'business-projection.listener.ts'),
    searchService: path.join(projectRoot, 'apps', 'api', 'src', 'search', 'search.service.ts'),
    redisService: path.join(projectRoot, 'apps', 'api', 'src', 'cache', 'redis.service.ts'),
};

const eventPatterns = [
    {
        label: 'ClaimRequestCreated',
        pattern: /publishClaimRequestCreated\s*\(/,
        sufficientForCacheInvalidation: false,
    },
    {
        label: 'ClaimRequestReviewed',
        pattern: /publishClaimRequestReviewed\s*\(/,
        sufficientForCacheInvalidation: false,
    },
    {
        label: 'BusinessLinkedToOrganization',
        pattern: /publishBusinessLinkedToOrganization\s*\(/,
        sufficientForCacheInvalidation: false,
    },
    {
        label: 'BusinessDuplicatesMerged',
        pattern: /publishBusinessDuplicatesMerged\s*\(/,
        sufficientForCacheInvalidation: false,
    },
    {
        label: 'CatalogBusinessCreated',
        pattern: /publishCatalogBusinessCreated\s*\(/,
        sufficientForCacheInvalidation: false,
    },
    {
        label: 'PotentialDuplicateDetected',
        pattern: /publishPotentialDuplicateDetected\s*\(/,
        sufficientForCacheInvalidation: false,
    },
];

const flows = [
    {
        name: 'createClaimRequest',
        methodName: 'createClaimRequest',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Review whether the claim-status update should publish business.changed after the transaction.',
        sensitiveFields: [
            field('claimStatus', /claimStatus|buildCreatedClaimBusinessUpdateData/),
        ],
    },
    {
        name: 'expireStaleClaimRequests',
        methodName: 'expireStaleClaimRequests',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Review whether each affected business should publish business.changed after stale claim expiration.',
        sensitiveFields: [
            field('claimStatus', /claimStatus|buildExpiredClaimBusinessUpdateData/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId|buildExpiredClaimBusinessUpdateData/),
            field('lastReviewedAt', /lastReviewedAt|buildExpiredClaimBusinessUpdateData/),
        ],
    },
    {
        name: 'reviewClaimRequest',
        methodName: 'reviewClaimRequest',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Review claim review cache invalidation before changing ownership or claim states.',
        sensitiveFields: [
            field('claimStatus', /claimStatus|buildUnderReviewClaimBusinessUpdateData|buildApprovedClaimBusinessUpdateData|buildRejectedClaimBusinessUpdateData/),
            field('ownerId', /ownerId|buildApprovedClaimBusinessUpdateData/),
            field('organizationId', /organizationId|buildApprovedClaimBusinessUpdateData/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId|buildUnderReviewClaimBusinessUpdateData|buildApprovedClaimBusinessUpdateData|buildRejectedClaimBusinessUpdateData/),
            field('claimedAt', /claimedAt|buildApprovedClaimBusinessUpdateData/),
            field('claimedByUserId', /claimedByUserId|buildApprovedClaimBusinessUpdateData/),
        ],
    },
    {
        name: 'updateAdminPublicationState',
        methodName: 'updateAdminPublicationState',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Publication state changes should keep public list/detail caches invalidated.',
        sensitiveFields: [
            field('publicStatus', /publicStatus|buildAdminPublicationUpdateData/),
            field('isPublished', /isPublished|buildAdminPublicationUpdateData/),
            field('isSearchable', /isSearchable|buildAdminPublicationUpdateData/),
            field('isDiscoverable', /isDiscoverable|buildAdminPublicationUpdateData/),
            field('publishedAt', /publishedAt|buildAdminPublicationUpdateData/),
            field('firstPublishedAt', /firstPublishedAt|buildAdminPublicationUpdateData/),
        ],
    },
    {
        name: 'markBusinessClaimedAdmin',
        methodName: 'markBusinessClaimedAdmin',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Admin claim changes should invalidate public claim/ownership state.',
        sensitiveFields: [
            field('ownerId', /ownerId|buildAdminMarkClaimedBusinessUpdateData/),
            field('organizationId', /organizationId|buildAdminMarkClaimedBusinessUpdateData/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId|buildAdminMarkClaimedBusinessUpdateData/),
            field('claimStatus', /claimStatus|buildAdminMarkClaimedBusinessUpdateData/),
            field('claimedAt', /claimedAt|buildAdminMarkClaimedBusinessUpdateData/),
            field('claimedByUserId', /claimedByUserId|buildAdminMarkClaimedBusinessUpdateData/),
            field('isClaimable', /isClaimable|buildAdminMarkClaimedBusinessUpdateData/),
        ],
    },
    {
        name: 'unclaimBusinessAdmin',
        methodName: 'unclaimBusinessAdmin',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Admin unclaim changes should invalidate public claim/ownership state.',
        sensitiveFields: [
            field('ownerId', /ownerId/),
            field('organizationId', /organizationId/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId/),
            field('claimStatus', /claimStatus/),
            field('claimedAt', /claimedAt/),
            field('claimedByUserId', /claimedByUserId/),
            field('isClaimable', /isClaimable/),
        ],
    },
    {
        name: 'revokeBusinessOwnership',
        methodName: 'revokeBusinessOwnership',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Ownership revocation should invalidate public claim/ownership state.',
        sensitiveFields: [
            field('organizationId', /organizationId|buildOwnershipRevocationBusinessUpdateData/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId|buildOwnershipRevocationBusinessUpdateData/),
            field('claimStatus', /claimStatus|buildOwnershipRevocationBusinessUpdateData/),
            field('isClaimable', /isClaimable|buildOwnershipRevocationBusinessUpdateData/),
            field('ownerId', /ownerId|buildOwnershipRevocationBusinessUpdateData/),
            field('claimedAt', /claimedAt|buildOwnershipRevocationBusinessUpdateData/),
            field('claimedByUserId', /claimedByUserId|buildOwnershipRevocationBusinessUpdateData/),
        ],
    },
    {
        name: 'delete',
        methodName: 'delete',
        riskIfMissing: 'critical',
        recommendationIfMissing: 'Soft delete/archive must invalidate public list/detail/search caches.',
        sensitiveFields: [
            field('deletedAt', /deletedAt/),
            field('verified', /verified/),
            field('publicStatus', /publicStatus/),
            field('lifecycleStatus', /lifecycleStatus/),
            field('isActive', /isActive/),
            field('isPublished', /isPublished/),
            field('isSearchable', /isSearchable/),
            field('isDiscoverable', /isDiscoverable/),
            field('primaryManagingOrganizationId', /primaryManagingOrganizationId/),
        ],
    },
    {
        name: 'verify',
        methodName: 'verify',
        riskIfMissing: 'medium',
        recommendationIfMissing: 'Verification changes should invalidate public badges/ranking surfaces.',
        sensitiveFields: [
            field('verified', /verified/),
            field('verifiedAt', /verifiedAt/),
            field('verificationStatus', /verificationStatus/),
        ],
    },
    {
        name: 'update',
        methodName: 'update',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Business profile edits should invalidate public list/detail/search caches.',
        sensitiveFields: [
            field('name', /name/),
            field('description', /description/),
            field('phone', /phone/),
            field('whatsapp', /whatsapp/),
            field('website', /website/),
            field('email', /email/),
            field('address', /address/),
            field('provinceId', /provinceId/),
            field('cityId', /cityId/),
            field('sectorId', /sectorId/),
            field('latitude', /latitude/),
            field('longitude', /longitude/),
            field('categories', /businessCategory|categories/),
            field('features', /businessFeature|features/),
            field('hours', /businessHour|hours/),
        ],
    },
    {
        name: 'create',
        methodName: 'create',
        riskIfMissing: 'high',
        recommendationIfMissing: 'Business creation should invalidate public discovery and detail caches.',
        sensitiveFields: [
            field('name', /name/),
            field('slug', /slug/),
            field('publicStatus', /publicStatus/),
            field('claimStatus', /claimStatus/),
            field('latitude', /latitude/),
            field('longitude', /longitude/),
            field('isPublished', /isPublished/),
            field('isSearchable', /isSearchable/),
            field('isDiscoverable', /isDiscoverable/),
        ],
    },
    {
        name: 'resolveDuplicateCase',
        methodName: 'resolveDuplicateCase',
        riskIfMissing: 'critical',
        recommendationIfMissing: 'Duplicate merges should invalidate primary and archived businesses.',
        sensitiveFields: [
            field('primary business', /primaryBusiness|mergeDuplicateBusinesses/),
            field('archived businesses', /archivedBusinesses|mergeDuplicateBusinesses/),
            field('deletedAt', /deletedAt|archivedBusinesses|mergeDuplicateBusinesses/),
            field('publicStatus', /publicStatus|mergeDuplicateBusinesses/),
            field('claimStatus', /claimStatus|mergeDuplicateBusinesses/),
        ],
    },
];

async function main() {
    const contents = await readFiles(files);
    const findings = [];
    const notes = [];

    const helperSignals = inspectClaimCreationHelper(contents.claimCreationHelpers);
    const sourceChecks = inspectSourceWiring(contents);
    const staleClaimExpirationPattern = inspectStaleClaimExpirationPattern(contents.businessesService);
    for (const issue of sourceChecks.findings) {
        findings.push(issue);
    }
    notes.push(...sourceChecks.notes);
    if (staleClaimExpirationPattern.isSafe) {
        notes.push('expireStaleClaimRequests returns affectedBusinesses and callers publish business.changed after commit/operation');
    }

    const flowReports = flows.map((flow) =>
        inspectFlow(flow, contents.businessesService, helperSignals, staleClaimExpirationPattern));

    for (const report of flowReports) {
        if (!report.exists) {
            findings.push({
                risk: 'medium',
                flow: report.name,
                message: `Flow "${report.name}" could not be found in businesses.service.ts.`,
                recommendation: 'Review whether the method was renamed before relying on this check.',
            });
            continue;
        }

        const hasBusinessChangedCoverage = report.hasBusinessChangedEvent || report.hasDeferredBusinessChangedEvent;

        if (report.sensitiveFields.length > 0 && !hasBusinessChangedCoverage) {
            findings.push({
                risk: report.riskIfMissing,
                flow: report.name,
                message: `Public fields changed without publishBusinessChangedEvent: ${report.sensitiveFields.join(', ')}.`,
                recommendation: report.recommendationIfMissing,
            });
        }

        if (report.insufficientEvents.length > 0 && !hasBusinessChangedCoverage) {
            findings.push({
                risk: report.riskIfMissing,
                flow: report.name,
                message: `Only insufficient event(s) found for cache invalidation: ${report.insufficientEvents.join(', ')}.`,
                recommendation: 'Treat these as domain side-effect events, not substitutes for business.changed cache invalidation.',
            });
        }
    }

    printReport({
        flowReports,
        sourceChecks,
        findings,
        notes,
    });
}

async function readFiles(fileMap) {
    const entries = await Promise.all(
        Object.entries(fileMap).map(async ([key, filePath]) => [
            key,
            await fs.readFile(filePath, 'utf8'),
        ]),
    );
    return Object.fromEntries(entries);
}

function inspectFlow(flow, source, helperSignals, staleClaimExpirationPattern) {
    const block = extractMethodBlock(source, flow.methodName);
    const helperText = flow.methodName === 'createClaimRequest'
        ? helperSignals.buildCreatedClaimBusinessUpdateData
        : '';
    const searchableText = `${block}\n${helperText}`;
    const sensitiveFields = flow.sensitiveFields
        .filter((entry) => entry.pattern.test(searchableText))
        .map((entry) => entry.name);
    const hasBusinessChangedEvent = /publishBusinessChangedEvent\s*\(/.test(block);
    const insufficientEvents = eventPatterns
        .filter((entry) => entry.pattern.test(block))
        .filter((entry) => !entry.sufficientForCacheInvalidation)
        .map((entry) => entry.label);
    const hasDeferredBusinessChangedEvent = flow.methodName === 'expireStaleClaimRequests'
        ? staleClaimExpirationPattern.isSafe
        : false;

    return {
        name: flow.name,
        exists: block.length > 0,
        sensitiveFields,
        hasBusinessChangedEvent,
        hasDeferredBusinessChangedEvent,
        insufficientEvents,
        riskIfMissing: flow.riskIfMissing,
        recommendationIfMissing: flow.recommendationIfMissing,
    };
}

function inspectStaleClaimExpirationPattern(source) {
    const helperBlock = extractMethodBlock(source, 'expireStaleClaimRequests');
    const helperReturnsAffectedBusinesses = /affectedBusinesses/.test(helperBlock)
        && /expiredCount/.test(helperBlock)
        && /return\s*{[\s\S]*affectedBusinesses[\s\S]*}/.test(helperBlock);
    const helperPublishesBusinessChanged = /publishBusinessChangedEvent\s*\(/.test(helperBlock)
        || /publishBusinessChangedEventsForBusinesses\s*\(/.test(helperBlock);
    const callerChecks = [
        inspectDirectStaleClaimExpirationCaller(source, 'listClaimRequests'),
        inspectDirectStaleClaimExpirationCaller(source, 'listMyClaimRequests'),
        inspectDirectStaleClaimExpirationCaller(source, 'getClaimRequestAdmin'),
        inspectDirectStaleClaimExpirationCaller(source, 'getCatalogQuality'),
        inspectTransactionStaleClaimExpirationCaller(source, {
            methodName: 'createClaimRequest',
            resultVariable: 'claimRequestResult',
            resultAccessor: 'claimRequest',
        }),
        inspectTransactionStaleClaimExpirationCaller(source, {
            methodName: 'reviewClaimRequest',
            resultVariable: 'reviewedClaimResult',
            resultAccessor: 'reviewedClaim',
        }),
    ];
    const detectedCallerCount = (source.match(/this\.expireStaleClaimRequests\s*\(/g) ?? []).length;
    const hasOnlyKnownCallers = detectedCallerCount === callerChecks.length;
    const callersPublishAfterExpiration = callerChecks.every((check) => check.ok) && hasOnlyKnownCallers;

    return {
        helperReturnsAffectedBusinesses,
        helperPublishesBusinessChanged,
        callerChecks,
        detectedCallerCount,
        hasOnlyKnownCallers,
        callersPublishAfterExpiration,
        isSafe: helperReturnsAffectedBusinesses
            && !helperPublishesBusinessChanged
            && callersPublishAfterExpiration,
    };
}

function inspectDirectStaleClaimExpirationCaller(source, methodName) {
    const block = extractMethodBlock(source, methodName);
    const callsExpiration = /const\s+staleClaimExpiration\s*=\s*await\s+this\.expireStaleClaimRequests\s*\(\s*this\.prisma\s*\)/.test(block);
    const publishesAffectedBusinesses = /this\.publishBusinessChangedEventsForBusinesses\s*\(\s*staleClaimExpiration\.affectedBusinesses\s*\)/.test(block);

    return {
        methodName,
        ok: callsExpiration && publishesAffectedBusinesses,
    };
}

function inspectTransactionStaleClaimExpirationCaller(source, {
    methodName,
    resultVariable,
    resultAccessor,
}) {
    const block = extractMethodBlock(source, methodName);
    const callsExpirationInTransaction = /this\.prisma\.\$transaction\s*\(\s*async\s*\(\s*tx\s*\)\s*=>[\s\S]*const\s+staleClaimExpiration\s*=\s*await\s+this\.expireStaleClaimRequests\s*\(\s*tx\b/.test(block);
    const returnsExpiredBusinesses = /expiredBusinesses\s*:\s*staleClaimExpiration\.affectedBusinesses/.test(block);
    const readsTransactionResultAfterCommit = new RegExp(
        `const\\s+\\w+\\s*=\\s*${escapeRegExp(resultVariable)}\\.${escapeRegExp(resultAccessor)}`,
    ).test(block);
    const publishesExpiredBusinessesAfterCommit = new RegExp(
        `${escapeRegExp(resultVariable)}\\.expiredBusinesses[\\s\\S]*this\\.publishBusinessChangedEvent\\s*\\(`,
    ).test(block);

    return {
        methodName,
        ok: callsExpirationInTransaction
            && returnsExpiredBusinesses
            && readsTransactionResultAfterCommit
            && publishesExpiredBusinessesAfterCommit,
    };
}

function inspectClaimCreationHelper(content) {
    return {
        buildCreatedClaimBusinessUpdateData: extractFunctionBlock(content, 'buildCreatedClaimBusinessUpdateData'),
    };
}

function inspectSourceWiring(contents) {
    const findings = [];
    const notes = [];

    const requiredChecks = [
        {
            label: 'Documentation map mentions createClaimRequest',
            ok: /createClaimRequest/.test(contents.cacheMap),
        },
        {
            label: 'DomainEventsService publishes business.changed',
            ok: /publishBusinessChanged\s*\([\s\S]*?this\.emit\(\s*['"]business\.changed['"]/.test(contents.domainEventsService),
        },
        {
            label: 'BusinessProjectionListener subscribes to business.changed',
            ok: /onBusinessChanged\s*\(/.test(contents.businessProjectionListener),
        },
        {
            label: 'BusinessProjectionListener deletes Redis prefixes',
            ok: /deleteByPrefix\s*\(/.test(contents.businessProjectionListener),
        },
        {
            label: 'BusinessProjectionListener updates search projection',
            ok: /indexBusinessById\s*\(/.test(contents.businessProjectionListener)
                && /removeBusiness\s*\(/.test(contents.businessProjectionListener),
        },
        {
            label: 'SearchService invalidates discovery/search prefixes',
            ok: /invalidateSearchCache\s*\(/.test(contents.searchService)
                && /PUBLIC_DISCOVERY_CACHE_PREFIX/.test(contents.searchService)
                && /PUBLIC_NEARBY_CACHE_PREFIX/.test(contents.searchService),
        },
        {
            label: 'RedisService exposes deleteByPrefix',
            ok: /async\s+deleteByPrefix\s*\(/.test(contents.redisService),
        },
    ];

    for (const check of requiredChecks) {
        if (check.ok) {
            notes.push(check.label);
        } else {
            findings.push({
                risk: 'medium',
                flow: 'source-wiring',
                message: `${check.label} was not detected.`,
                recommendation: 'Review source wiring before relying on cache event findings.',
            });
        }
    }

    return { findings, notes };
}

function extractMethodBlock(content, methodName) {
    const methodPattern = new RegExp(`(?:private\\s+)?async\\s+${escapeRegExp(methodName)}\\s*\\(`);
    const match = methodPattern.exec(content);
    if (!match) {
        return '';
    }

    const openBrace = content.indexOf('{', match.index);
    if (openBrace === -1) {
        return '';
    }

    return extractBalancedBlock(content, openBrace);
}

function extractFunctionBlock(content, functionName) {
    const functionPattern = new RegExp(`function\\s+${escapeRegExp(functionName)}\\s*\\(`);
    const match = functionPattern.exec(content);
    if (!match) {
        return '';
    }

    const openBrace = content.indexOf('{', match.index);
    if (openBrace === -1) {
        return '';
    }

    return extractBalancedBlock(content, openBrace);
}

function extractBalancedBlock(content, openBrace) {
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
            return content.slice(openBrace, index + 1);
        }
    }
    return content.slice(openBrace);
}

function field(name, pattern) {
    return { name, pattern };
}

function printReport({
    flowReports,
    sourceChecks,
    findings,
    notes,
}) {
    console.log('[business-cache-events-check] Report-only business.changed cache event check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');
    console.log('Source wiring:');
    for (const note of sourceChecks.notes) {
        console.log(`- ${note}: yes`);
    }
    console.log('');
    console.log('Flow coverage:');
    for (const report of flowReports) {
        console.log(`- ${report.name}`);
        console.log(`  method found: ${formatBoolean(report.exists)}`);
        console.log(`  sensitive public fields detected: ${formatList(report.sensitiveFields)}`);
        console.log(`  publishBusinessChangedEvent: ${formatBoolean(report.hasBusinessChangedEvent)}`);
        if (report.hasDeferredBusinessChangedEvent) {
            console.log('  deferred business.changed via callers: yes');
        }
        console.log(`  insufficient events only: ${formatList(report.insufficientEvents)}`);
        console.log(`  risk if missing business.changed: ${report.riskIfMissing}`);
    }
    console.log('');

    if (findings.length > 0) {
        console.log(`Findings (${findings.length}):`);
        for (const finding of findings) {
            console.log(`- [${finding.risk.toUpperCase()}] ${finding.flow}: ${finding.message}`);
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

function formatBoolean(value) {
    return value ? 'yes' : 'no';
}

function formatList(values) {
    return values.length > 0 ? values.join(', ') : '(none)';
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
    console.error('[business-cache-events-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
