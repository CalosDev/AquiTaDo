import { Type } from 'class-transformer';
import {
    IsInt,
    IsLatitude,
    IsLongitude,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateCheckInDto {
    @IsUUID()
    businessId!: string;

    @IsOptional()
    @Type(() => Number)
    @IsLatitude()
    latitude?: number;

    @IsOptional()
    @Type(() => Number)
    @IsLongitude()
    longitude?: number;

    @IsOptional()
    @IsString()
    @MaxLength(220)
    note?: string;
}

export class ListMyCheckInsQueryDto {
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
