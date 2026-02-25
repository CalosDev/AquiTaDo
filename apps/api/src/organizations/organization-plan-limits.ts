import { OrganizationPlan } from '../generated/prisma/client';

export interface OrganizationPlanLimits {
    maxBusinesses: number | null;
    maxMembers: number | null;
}

const ORGANIZATION_PLAN_LIMITS: Record<OrganizationPlan, OrganizationPlanLimits> = {
    FREE: {
        maxBusinesses: 1,
        maxMembers: 3,
    },
    GROWTH: {
        maxBusinesses: 5,
        maxMembers: 15,
    },
    SCALE: {
        maxBusinesses: null,
        maxMembers: null,
    },
};

export function getOrganizationPlanLimits(plan: OrganizationPlan): OrganizationPlanLimits {
    return ORGANIZATION_PLAN_LIMITS[plan];
}
