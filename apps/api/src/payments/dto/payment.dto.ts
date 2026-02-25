import { Type } from 'class-transformer';
import {
    IsISO8601,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    Min,
} from 'class-validator';

export class ListPaymentsQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number;
}

export class CreateAdsWalletCheckoutSessionDto {
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(1)
    amount!: number;

    @IsString()
    @IsUrl({
        require_protocol: true,
    })
    successUrl!: string;

    @IsString()
    @IsUrl({
        require_protocol: true,
    })
    cancelUrl!: string;
}

export class ListAdsWalletTopupsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class BillingReportQueryDto {
    @IsOptional()
    @IsISO8601()
    from?: string;

    @IsOptional()
    @IsISO8601()
    to?: string;
}
