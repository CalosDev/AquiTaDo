import { Type } from 'class-transformer';
import {
    IsEnum,
    IsISO8601,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { BookingStatus, TransactionStatus } from '../../generated/prisma/client';

export class CreateBookingDto {
    @IsUUID()
    businessId!: string;

    @IsISO8601()
    scheduledFor!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    partySize?: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @IsOptional()
    @IsUUID()
    promotionId?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    couponCode?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    quotedAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    depositAmount?: number;

    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;
}

export class UpdateBookingStatusDto {
    @IsEnum(BookingStatus)
    status!: BookingStatus;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    quotedAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    depositAmount?: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}

export class ListBookingsQueryDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsEnum(BookingStatus)
    status?: BookingStatus;

    @IsOptional()
    @IsISO8601()
    from?: string;

    @IsOptional()
    @IsISO8601()
    to?: string;

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

export class ListTransactionsQueryDto {
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsEnum(TransactionStatus)
    status?: TransactionStatus;

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
