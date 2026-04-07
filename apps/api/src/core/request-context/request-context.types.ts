import { OrganizationRole, Role } from '../../generated/prisma/client';

export interface RequestContextState {
    requestId: string | null;
    traceId: string | null;
    traceparent: string | null;
    method: string | null;
    path: string | null;
    userId: string | null;
    userRole: Role | null;
    organizationId: string | null;
    organizationRole: OrganizationRole | null;
}
