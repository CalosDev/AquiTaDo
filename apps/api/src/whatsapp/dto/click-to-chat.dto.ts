import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateClickToChatDto {
    @IsUUID()
    businessId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    source?: string;

    @IsOptional()
    @IsString()
    @MaxLength(191)
    sessionId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    visitorId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    variantKey?: string;
}

export class ListWhatsAppConversationsDto {
    @IsOptional()
    @IsString()
    status?: 'OPEN' | 'CLOSED' | 'ESCALATED';

    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class UpdateWhatsAppConversationStatusDto {
    @IsString()
    status!: 'OPEN' | 'CLOSED' | 'ESCALATED';

    @IsOptional()
    @IsBoolean()
    autoResponderActive?: boolean;
}
