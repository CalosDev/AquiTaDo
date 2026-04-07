import { Request } from 'express';
import { OrganizationRole, Role } from '../../generated/prisma/client';

export interface OrganizationContext {
    organizationId: string;
    organizationRole: OrganizationRole | null;
}

export interface AuthenticatedRequestUser {
    id: string;
    email: string;
    name: string;
    role: Role;
}

export type RequestWithOrganizationContext = Request & {
    user?: AuthenticatedRequestUser;
    organizationContext?: OrganizationContext | null;
};
