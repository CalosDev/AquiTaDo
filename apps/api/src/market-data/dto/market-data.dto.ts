import { Type } from 'class-transformer';
import {
    IsLatitude,
    IsLongitude,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Min,
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
