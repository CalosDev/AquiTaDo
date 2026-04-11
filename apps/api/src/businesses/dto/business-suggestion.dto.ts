import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUrl,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const URL_OPTIONS = {
    require_protocol: true,
    protocols: ['http', 'https'],
};

const BUSINESS_SUGGESTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const BUSINESS_PUBLIC_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'SUSPENDED'] as const;

export class CreateBusinessSuggestionDto {
    @IsString()
    @MaxLength(200)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsString()
    @MaxLength(500)
    address!: string;

    @IsUUID()
    provinceId!: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    whatsapp?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    website?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}

export class BusinessSuggestionQueryDto {
    @IsOptional()
    @IsIn(BUSINESS_SUGGESTION_STATUSES)
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class ReviewBusinessSuggestionDto {
    @IsIn(['APPROVED', 'REJECTED'])
    status!: 'APPROVED' | 'REJECTED';

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    notes?: string;

    @IsOptional()
    @IsIn(BUSINESS_PUBLIC_STATUSES)
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    ignorePotentialDuplicates?: boolean;
}
