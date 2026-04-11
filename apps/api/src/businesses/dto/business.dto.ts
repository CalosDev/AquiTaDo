import { Type } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsArray,
    IsBoolean,
    IsUUID,
    IsEmail,
    Matches,
    IsIn,
    IsUrl,
    MaxLength,
    MinLength,
    Min,
    Max,
    ValidateNested,
    IsInt,
} from 'class-validator';

const URL_OPTIONS = {
    require_protocol: true,
    protocols: ['http', 'https'],
};

const BUSINESS_PRICE_RANGES = ['BUDGET', 'MODERATE', 'PREMIUM', 'LUXURY'] as const;
const BUSINESS_PUBLIC_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'SUSPENDED'] as const;
const BUSINESS_CLAIM_STATUSES = ['UNCLAIMED', 'PENDING_CLAIM', 'CLAIMED'] as const;
const BUSINESS_SOURCES = ['ADMIN', 'OWNER', 'IMPORT', 'USER_SUGGESTION', 'SYSTEM'] as const;
const BUSINESS_CLAIM_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
const BUSINESS_CLAIM_EVIDENCE_TYPES = ['PHONE', 'EMAIL', 'WEBSITE', 'INSTAGRAM', 'DOCUMENT', 'NOTE', 'OTHER'] as const;

export class BusinessHourInputDto {
    @IsNumber()
    @Min(0)
    @Max(6)
    dayOfWeek!: number;

    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, {
        message: 'opensAt debe usar formato HH:mm',
    })
    opensAt?: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, {
        message: 'closesAt debe usar formato HH:mm',
    })
    closesAt?: string;

    @IsOptional()
    @IsBoolean()
    closed?: boolean;
}

export class CreateBusinessDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    description!: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    whatsapp?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    website?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(160)
    email?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    instagramUrl?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    facebookUrl?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    tiktokUrl?: string;

    @IsOptional()
    @IsIn(BUSINESS_PRICE_RANGES)
    priceRange?: 'BUDGET' | 'MODERATE' | 'PREMIUM' | 'LUXURY';

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    address!: string;

    @IsString()
    @IsNotEmpty()
    @IsUUID()
    provinceId!: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsUUID()
    sectorId?: string;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    categoryIds?: string[];

    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    featureIds?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BusinessHourInputDto)
    hours?: BusinessHourInputDto[];

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    ignorePotentialDuplicates?: boolean;
}

export class UpdateBusinessDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    whatsapp?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    website?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(160)
    email?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    instagramUrl?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    facebookUrl?: string;

    @IsOptional()
    @IsUrl(URL_OPTIONS)
    @MaxLength(255)
    tiktokUrl?: string;

    @IsOptional()
    @IsIn(BUSINESS_PRICE_RANGES)
    priceRange?: 'BUDGET' | 'MODERATE' | 'PREMIUM' | 'LUXURY';

    @IsOptional()
    @IsString()
    @MaxLength(500)
    address?: string;

    @IsOptional()
    @IsUUID()
    provinceId?: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;

    @IsOptional()
    @IsUUID()
    sectorId?: string;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    categoryIds?: string[];

    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    featureIds?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BusinessHourInputDto)
    hours?: BusinessHourInputDto[];
}

export class BusinessQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

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
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.1)
    @Max(100)
    radiusKm?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    verified?: boolean;

    @IsOptional()
    @IsIn(BUSINESS_PUBLIC_STATUSES)
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';

    @IsOptional()
    @IsIn(BUSINESS_CLAIM_STATUSES)
    claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED';

    @IsOptional()
    @IsIn(BUSINESS_SOURCES)
    source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';

    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class CreatePublicLeadDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    contactName!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    @Matches(/^[0-9+\-\s()]{7,30}$/, {
        message: 'El teléfono debe contener solo números y símbolos válidos',
    })
    contactPhone!: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(160)
    contactEmail?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(1200)
    message!: string;

    @IsOptional()
    @IsString()
    @IsIn(['WHATSAPP', 'PHONE', 'EMAIL'])
    @MaxLength(32)
    preferredChannel?: 'WHATSAPP' | 'PHONE' | 'EMAIL';
}

export class NearbyQueryDto {
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat!: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    lng!: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(50)
    radius?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @IsUUID()
    sectorId?: string;
}

export class DeleteBusinessDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(15)
    @MaxLength(500)
    @Matches(/\S+/, {
        message: 'El motivo de eliminacion es obligatorio',
    })
    reason!: string;
}

export class CatalogQualityQueryDto {
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class ClaimSearchQueryDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(200)
    q!: string;

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
    @Max(12)
    limit?: number;
}

export class CreateBusinessClaimRequestDto {
    @IsIn(BUSINESS_CLAIM_EVIDENCE_TYPES)
    evidenceType!: 'PHONE' | 'EMAIL' | 'WEBSITE' | 'INSTAGRAM' | 'DOCUMENT' | 'NOTE' | 'OTHER';

    @IsOptional()
    @IsString()
    @MaxLength(255)
    evidenceValue?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}

export class ReviewBusinessClaimRequestDto {
    @IsIn(['APPROVED', 'REJECTED'])
    status!: 'APPROVED' | 'REJECTED';

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    notes?: string;
}

export class BusinessClaimRequestQueryDto {
    @IsOptional()
    @IsIn(BUSINESS_CLAIM_REQUEST_STATUSES)
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class CreateAdminCatalogBusinessDto extends CreateBusinessDto {
    @IsOptional()
    @IsIn(['ADMIN', 'IMPORT', 'SYSTEM'])
    source?: 'ADMIN' | 'IMPORT' | 'SYSTEM';

    @IsOptional()
    @IsIn(BUSINESS_PUBLIC_STATUSES)
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    catalogManagedByAdmin?: boolean;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isClaimable?: boolean;
}
