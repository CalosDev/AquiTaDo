import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const BUSINESS_IMAGE_TYPES = ['COVER', 'GALLERY', 'MENU', 'INTERIOR', 'EXTERIOR'] as const;

export class UpdateBusinessImageDto {
    @IsOptional()
    @IsString()
    @MaxLength(160)
    caption?: string;

    @IsOptional()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsBoolean()
    isCover?: boolean;

    @IsOptional()
    @IsIn(BUSINESS_IMAGE_TYPES)
    type?: 'COVER' | 'GALLERY' | 'MENU' | 'INTERIOR' | 'EXTERIOR';
}
