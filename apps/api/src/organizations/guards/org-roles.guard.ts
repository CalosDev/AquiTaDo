import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '../../generated/prisma/client';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';
import { RequestWithOrganizationContext } from '../types/organization-context.type';

@Injectable()
export class OrgRolesGuard implements CanActivate {
    constructor(
        @Inject(Reflector)
        private readonly reflector: Reflector,
    ) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(ORG_ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithOrganizationContext>();

        if (request.user?.role === 'ADMIN') {
            return true;
        }

        const organizationRole = request.organizationContext?.organizationRole;
        if (!organizationRole) {
            return false;
        }

        return requiredRoles.includes(organizationRole);
    }
}
