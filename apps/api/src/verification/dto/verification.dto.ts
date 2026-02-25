import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import {
    BusinessVerificationStatus,
    VerificationDocumentStatus,
    VerificationDocumentType,
} from '../../generated/prisma/client';

export class SubmitVerificationDocumentDto {
    @IsUUID()
    businessId!: string;

    @IsEnum(VerificationDocumentType)
    documentType!: VerificationDocumentType;

    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    fileUrl!: string;
}

export class ListVerificationDocumentsQueryDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsEnum(VerificationDocumentStatus)
    status?: VerificationDocumentStatus;

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

export class SubmitBusinessVerificationDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class ReviewBusinessVerificationDto {
    @IsEnum(BusinessVerificationStatus)
    status!: BusinessVerificationStatus;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;
}

export class ReviewVerificationDocumentDto {
    @IsEnum(VerificationDocumentStatus)
    status!: VerificationDocumentStatus;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    rejectionReason?: string;
}
