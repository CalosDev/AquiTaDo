import { Type } from 'class-transformer';
import {
    IsLatitude,
    IsLongitude,
    IsNumber,
    IsOptional,
    IsString,
    IsIn,
    Max,
    Matches,
    Min,
    IsInt,
    IsUUID,
} from 'class-validator';

export class CurrentWeatherQueryDto {
    @Type(() => Number)
    @IsLatitude()
    lat!: number;

    @Type(() => Number)
    @IsLongitude()
    lng!: number;
}

export class ExchangeRateQueryDto {
    @IsOptional()
    @IsString()
    @Matches(/^[A-Z]{3}$/)
    base?: string;

    @IsOptional()
    @IsString()
    @Matches(/^[A-Z]{3}$/)
    target?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0.0001)
    amount?: number;
}

export class DominicanHolidaysQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2020)
    @Max(2100)
    year?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(40)
    limit?: number;

    @IsOptional()
    @IsString()
    @IsIn(['true', 'false', '1', '0'])
    upcomingOnly?: string;
}

export class CommercialAgendaQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(7)
    @Max(180)
    horizonDays?: number;
}

export class CommercialCalendarQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(12)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(7)
    @Max(180)
    horizonDays?: number;

    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;
}
