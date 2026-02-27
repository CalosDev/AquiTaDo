import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class SearchBusinessesQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(120)
    q?: string;

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

export class ReindexBusinessesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(20_000)
    limit?: number;
}
