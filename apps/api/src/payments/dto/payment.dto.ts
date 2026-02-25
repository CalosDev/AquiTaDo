import { IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class ListPaymentsQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
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
