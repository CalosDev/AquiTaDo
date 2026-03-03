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
    MaxLength,
    Min,
    Max,
} from 'class-validator';

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
}

export class BusinessQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

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
    @IsString()
    @MaxLength(80)
    feature?: string;

    @IsOptional()
    @IsBoolean()
    verified?: boolean;

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
        message: 'El telefono debe contener solo numeros y simbolos validos',
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
}
