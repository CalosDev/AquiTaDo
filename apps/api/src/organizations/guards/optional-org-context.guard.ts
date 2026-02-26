import { ExecutionContext, Injectable } from '@nestjs/common';
import { OrgContextGuard } from './org-context.guard';
import { RequestWithOrganizationContext } from '../types/organization-context.type';

@Injectable()
export class OptionalOrgContextGuard extends OrgContextGuard {
    protected override isOrganizationRequired(): boolean {
        return false;
    }

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithOrganizationContext>();
        if (!request.user?.id) {
            request.organizationContext = null;
            return true;
        }

        return super.canActivate(context);
    }
}
