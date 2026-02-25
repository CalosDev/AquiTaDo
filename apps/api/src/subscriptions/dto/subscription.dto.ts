import { IsEnum, IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { OrganizationPlan } from '../../generated/prisma/client';

export class CreateCheckoutSessionDto {
    @IsEnum(OrganizationPlan)
    planCode!: OrganizationPlan;

    @IsString()
    @IsNotEmpty()
    @IsUrl({ require_tld: false })
    successUrl!: string;

    @IsString()
    @IsNotEmpty()
    @IsUrl({ require_tld: false })
    cancelUrl!: string;
}
