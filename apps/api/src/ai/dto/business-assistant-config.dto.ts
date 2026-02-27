import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class BusinessAssistantConfigDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    customPrompt?: string;
}

export class BusinessAutoReplyDto {
    @IsString()
    @MaxLength(1200)
    message!: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    customerName?: string;
}

