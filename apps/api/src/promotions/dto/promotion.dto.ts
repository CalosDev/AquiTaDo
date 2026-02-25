import { Type } from 'class-transformer';
import {
    IsBoolean,
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
import { DiscountType } from '../../generated/prisma/client';

export enum PromotionLifecycleStatus {
    ACTIVE = 'ACTIVE',
    SCHEDULED = 'SCHEDULED',
    EXPIRED = 'EXPIRED',
    ALL = 'ALL',
}

export class CreatePromotionDto {
    @IsUUID()
    businessId!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(3000)
    description?: string;

    @IsEnum(DiscountType)
    discountType!: DiscountType;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    discountValue!: number;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    couponCode?: string;

    @IsISO8601()
    startsAt!: string;

    @IsISO8601()
    endsAt!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxRedemptions?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isFlashOffer?: boolean;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isActive?: boolean;
}

export class UpdatePromotionDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(160)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(3000)
    description?: string;

    @IsOptional()
    @IsEnum(DiscountType)
    discountType?: DiscountType;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    discountValue?: number;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    couponCode?: string;

    @IsOptional()
    @IsISO8601()
    startsAt?: string;

    @IsOptional()
    @IsISO8601()
    endsAt?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxRedemptions?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isFlashOffer?: boolean;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isActive?: boolean;
}

export class ListPublicPromotionsQueryDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    flashOnly?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}

export class ListMyPromotionsQueryDto extends ListPublicPromotionsQueryDto {
    @IsOptional()
    @IsEnum(PromotionLifecycleStatus)
    status?: PromotionLifecycleStatus;
}
