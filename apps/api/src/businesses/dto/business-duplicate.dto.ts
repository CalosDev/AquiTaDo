import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const BUSINESS_DUPLICATE_CASE_STATUSES = ['DISMISSED', 'CONFLICT', 'MERGED'] as const;

export class BusinessDuplicateCaseQueryDto {
    @IsOptional()
    @IsIn(BUSINESS_DUPLICATE_CASE_STATUSES)
    status?: 'DISMISSED' | 'CONFLICT' | 'MERGED';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class ResolveBusinessDuplicateCaseDto {
    @IsIn(BUSINESS_DUPLICATE_CASE_STATUSES)
    status!: 'DISMISSED' | 'CONFLICT' | 'MERGED';

    @IsArray()
    @ArrayMinSize(2)
    @IsUUID('all', { each: true })
    businessIds!: string[];

    @IsOptional()
    @IsUUID()
    primaryBusinessId?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    reasons?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}
