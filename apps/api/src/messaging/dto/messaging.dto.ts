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
import { ConversationStatus } from '../../generated/prisma/client';

export class CreateConversationDto {
    @IsUUID()
    businessId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    subject?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    message!: string;
}

export class SendConversationMessageDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(4000)
    content!: string;
}

export class ListConversationsQueryDto {
    @IsOptional()
    @IsEnum(ConversationStatus)
    status?: ConversationStatus;

    @IsOptional()
    @IsUUID()
    businessId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}

export class UpdateConversationStatusDto {
    @IsEnum(ConversationStatus)
    status!: ConversationStatus;
}

export class ConvertConversationToBookingDto {
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

    @IsOptional()
    @IsUUID()
    promotionId?: string;
}
