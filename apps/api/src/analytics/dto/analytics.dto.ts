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
} from 'class-validator';

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
