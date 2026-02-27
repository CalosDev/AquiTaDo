import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithOrganizationContext } from '../../organizations/types/organization-context.type';
import { POLICY_KEY } from './policy.decorator';
import { PolicyService } from './policy.service';
import { ResourcePolicy } from './policy.types';

@Injectable()
export class PolicyGuard implements CanActivate {
    constructor(
        @Inject(Reflector)
        private readonly reflector: Reflector,
        @Inject(PolicyService)
        private readonly policyService: PolicyService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const policy = this.reflector.getAllAndOverride<ResourcePolicy | undefined>(POLICY_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!policy) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithOrganizationContext>();
        const principal = request.user;
        if (!principal?.id) {
            throw new UnauthorizedException('Unauthorized');
        }

        const resourceIdParam = policy.resourceIdParam ?? 'id';
        const rawResourceId = request.params?.[resourceIdParam];
        const resourceId = Array.isArray(rawResourceId)
            ? rawResourceId[0]
            : rawResourceId;

        await this.policyService.assertAuthorized(
            {
                id: principal.id,
                role: principal.role,
            },
            request.organizationContext ?? null,
            policy,
            resourceId,
        );

        return true;
    }
}
