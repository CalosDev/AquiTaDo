import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    @Matches(SLUG_PATTERN, {
        message: 'slug must be lowercase and use hyphens only',
    })
    slug!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    icon?: string;
}

export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Matches(SLUG_PATTERN, {
        message: 'slug must be lowercase and use hyphens only',
    })
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    icon?: string;
}
