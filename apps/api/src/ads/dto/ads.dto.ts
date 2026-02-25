import { Type } from 'class-transformer';
import {
    IsEnum,
    IsISO8601,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { AdCampaignStatus } from '../../generated/prisma/client';

export class CreateAdCampaignDto {
    @IsUUID()
    businessId!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    name!: string;

    @IsOptional()
    @IsUUID()
    targetProvinceId?: string;

    @IsOptional()
    @IsUUID()
    targetCategoryId?: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(1)
    dailyBudget!: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(1)
    totalBudget!: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    bidAmount!: number;

    @IsISO8601()
    startsAt!: string;

    @IsISO8601()
    endsAt!: string;

    @IsOptional()
    @IsEnum(AdCampaignStatus)
    status?: AdCampaignStatus;
}

export class ListAdCampaignsQueryDto {
    @IsOptional()
    @IsEnum(AdCampaignStatus)
    status?: AdCampaignStatus;

    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class UpdateAdCampaignStatusDto {
    @IsEnum(AdCampaignStatus)
    status!: AdCampaignStatus;
}

export class AdPlacementQueryDto {
    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(30)
    limit?: number;
}

export class TrackAdInteractionDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    visitorId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    placementKey?: string;
}
