import { Type } from 'class-transformer';
import {
    IsEmail,
    IsEnum,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    OrganizationPlan,
    OrganizationRole,
    OrganizationSubscriptionStatus,
} from '../../generated/prisma/client';

export class CreateOrganizationDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name!: string;
}

export class UpdateOrganizationDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name?: string;
}

export class InviteOrganizationMemberDto {
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @IsOptional()
    @IsEnum(OrganizationRole)
    role?: OrganizationRole;
}

export class UpdateOrganizationMemberRoleDto {
    @IsEnum(OrganizationRole)
    role!: OrganizationRole;
}

export class UpdateOrganizationSubscriptionDto {
    @IsEnum(OrganizationPlan)
    plan!: OrganizationPlan;

    @IsOptional()
    @IsEnum(OrganizationSubscriptionStatus)
    subscriptionStatus?: OrganizationSubscriptionStatus;

    @IsOptional()
    @IsISO8601()
    subscriptionRenewsAt?: string;
}

export class ListOrganizationAuditLogsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
