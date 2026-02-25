import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';

export const ORG_ROLES_KEY = 'org_roles';
export const OrgRoles = (...roles: OrganizationRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
