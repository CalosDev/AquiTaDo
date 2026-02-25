import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationContext, RequestWithOrganizationContext } from '../types/organization-context.type';

export const CurrentOrganization = createParamDecorator(
    (data: keyof OrganizationContext | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest<RequestWithOrganizationContext>();
        const context = request.organizationContext ?? null;

        if (data) {
            return context?.[data];
        }

        return context;
    },
);
