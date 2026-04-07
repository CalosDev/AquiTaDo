import { IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum FrontendSignalKind {
    ROUTE_VIEW = 'ROUTE_VIEW',
    WEB_VITAL = 'WEB_VITAL',
    CLIENT_ERROR = 'CLIENT_ERROR',
}

export class TrackFrontendSignalDto {
    @IsEnum(FrontendSignalKind)
    kind!: FrontendSignalKind;

    @IsString()
    @MaxLength(160)
    route!: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    metricName?: string;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    value?: number;

    @IsOptional()
    @IsIn(['good', 'needs-improvement', 'poor'])
    rating?: 'good' | 'needs-improvement' | 'poor';

    @IsOptional()
    @IsString()
    @MaxLength(32)
    source?: string;

    @IsOptional()
    @IsIn(['ANONYMOUS', 'USER', 'BUSINESS_OWNER', 'ADMIN'])
    role?: 'ANONYMOUS' | 'USER' | 'BUSINESS_OWNER' | 'ADMIN';
}
