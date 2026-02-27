import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class NearbyBusinessesQueryDto {
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    lng!: number;

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
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @IsUUID()
    organizationId?: string;
}

