import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    IsNumber,
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
    @IsString()
    @MaxLength(120)
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'categorySlug debe ser un slug valido',
    })
    categorySlug?: string;

    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'provinceSlug debe ser un slug valido',
    })
    provinceSlug?: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsUUID()
    sectorId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    feature?: string;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    openNow?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0.1)
    @Max(100)
    radiusKm?: number;

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
