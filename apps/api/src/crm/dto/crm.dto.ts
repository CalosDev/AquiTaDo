import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsISO8601,
    IsOptional,
    IsPositive,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { SalesLeadStage } from '../../generated/prisma/client';

export class ListCustomersQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

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
    @Max(100)
    limit?: number;
}

export class ListSalesPipelineQueryDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsEnum(SalesLeadStage)
    stage?: SalesLeadStage;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class CreateSalesLeadDto {
    @IsUUID()
    businessId!: string;

    @IsOptional()
    @IsUUID()
    customerUserId?: string;

    @IsOptional()
    @IsUUID()
    conversationId?: string;

    @IsOptional()
    @IsUUID()
    bookingId?: string;

    @IsString()
    @MaxLength(160)
    title!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    notes?: string;

    @IsOptional()
    @Type(() => Number)
    @IsPositive()
    estimatedValue?: number;

    @IsOptional()
    @IsISO8601()
    expectedCloseAt?: string;
}

export class UpdateSalesLeadStageDto {
    @IsEnum(SalesLeadStage)
    stage!: SalesLeadStage;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    lostReason?: string;
}
