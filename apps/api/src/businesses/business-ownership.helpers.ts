export const activeBusinessOwnershipSelect = {
    where: {
        isActive: true,
    },
    select: {
        organizationId: true,
    },
    take: 1,
} as const;

type BusinessOrganizationRef = {
    organizationId?: string | null;
    ownerships?: Array<{
        organizationId: string;
    }> | null;
};

export function resolveActiveBusinessOrganizationId(
    business?: BusinessOrganizationRef | null,
): string | null {
    if (!business) {
        return null;
    }

    return business.ownerships?.[0]?.organizationId
        ?? business.organizationId
        ?? null;
}

export function businessBelongsToOrganization(
    business: BusinessOrganizationRef | null | undefined,
    organizationId?: string | null,
): boolean {
    if (!business || !organizationId) {
        return false;
    }

    return resolveActiveBusinessOrganizationId(business) === organizationId;
}
