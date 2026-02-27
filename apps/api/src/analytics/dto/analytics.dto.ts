import { Type } from 'class-transformer';
import {
    IsEnum,
    IsISO8601,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    IsObject,
} from 'class-validator';
import { GrowthEventType, MarketReportType } from '../../generated/prisma/client';

export enum AnalyticsEventType {
    VIEW = 'VIEW',
    CLICK = 'CLICK',
    CONVERSION = 'CONVERSION',
    RESERVATION_REQUEST = 'RESERVATION_REQUEST',
}

export class TrackBusinessEventDto {
    @IsUUID()
    businessId!: string;

    @IsEnum(AnalyticsEventType)
    eventType!: AnalyticsEventType;

    @IsOptional()
    @IsISO8601()
    occurredAt?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    visitorId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    amount?: number;
}

export class AnalyticsRangeQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number;
}

export class MarketInsightsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number;

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
    @Max(50)
    limit?: number;
}

export class GenerateMarketReportDto {
    @IsEnum(MarketReportType)
    reportType!: MarketReportType;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number;

    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;
}

export class ListMarketReportsQueryDto {
    @IsOptional()
    @IsEnum(MarketReportType)
    reportType?: MarketReportType;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class TrackGrowthEventDto {
    @IsEnum(GrowthEventType)
    eventType!: GrowthEventType;

    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsUUID()
    userId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    visitorId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    sessionId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    variantKey?: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @MaxLength(255)
    searchQuery?: string;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;

    @IsOptional()
    @IsISO8601()
    occurredAt?: string;
}

export class GrowthInsightsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number;

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
    @Max(50)
    limit?: number;
}
