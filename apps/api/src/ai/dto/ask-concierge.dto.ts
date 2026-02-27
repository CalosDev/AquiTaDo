import {
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class AskConciergeDto {
    @IsString()
    @MaxLength(1200)
    query!: string;

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
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(25)
    limit?: number;
}

