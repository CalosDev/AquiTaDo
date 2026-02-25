import { Injectable } from '@nestjs/common';
import { OrgContextGuard } from './org-context.guard';

@Injectable()
export class OptionalOrgContextGuard extends OrgContextGuard {
    protected override isOrganizationRequired(): boolean {
        return false;
    }
}
