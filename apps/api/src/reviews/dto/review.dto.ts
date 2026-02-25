import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateReviewDto {
    @IsInt()
    @Min(1)
    @Max(5)
    rating!: number;

    @IsOptional()
    @IsString()
    comment?: string;

    @IsString()
    @IsNotEmpty()
    @IsUUID()
    businessId!: string;
}

export class ListFlaggedReviewsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsUUID()
    businessId?: string;
}

export class ModerateReviewDto {
    @IsIn(['APPROVED', 'FLAGGED'])
    status!: 'APPROVED' | 'FLAGGED';

    @IsOptional()
    @IsString()
    @MaxLength(255)
    reason?: string;
}
