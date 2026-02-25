import { Request } from 'express';
import { OrganizationRole } from '../../generated/prisma/client';

export interface OrganizationContext {
    organizationId: string;
    organizationRole: OrganizationRole | null;
    isGlobalAdmin: boolean;
}

export interface AuthenticatedRequestUser {
    id: string;
    email: string;
    name: string;
    role: string;
}

export type RequestWithOrganizationContext = Request & {
    user?: AuthenticatedRequestUser;
    organizationContext?: OrganizationContext | null;
};
