import { IsEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMyProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @IsOptional()
    @IsEmpty({
        message: 'La foto de perfil se actualiza mediante el flujo de carga gestionada',
    })
    avatarUrl?: never;
}
