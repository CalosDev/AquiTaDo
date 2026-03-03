import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class ListFavoriteBusinessesQueryDto {
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
    @Max(200)
    limit?: number;
}

export class ToggleFavoriteBusinessDto {
    @IsUUID()
    businessId!: string;
}

export class ListBusinessListsQueryDto {
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

export class CreateBusinessListDto {
    @IsString()
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(600)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;
}

export class AddBusinessToListDto {
    @IsUUID()
    businessId!: string;
}
