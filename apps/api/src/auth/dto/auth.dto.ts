import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export class RegisterDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(100)
    name!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    @MaxLength(120)
    email!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_COMPLEXITY_REGEX, {
        message: 'La contraseña debe incluir letras y números',
    })
    password!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsOptional()
    @IsString()
    @Matches(/^[0-9+()\-\s]{7,20}$/, {
        message: 'El teléfono no tiene un formato válido',
    })
    phone?: string;

    @IsOptional()
    @IsIn(['USER', 'BUSINESS_OWNER'])
    role?: 'USER' | 'BUSINESS_OWNER';
}

export class LoginDto {
    @IsEmail()
    email!: string;

    @IsString()
    @IsNotEmpty()
    password!: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{6}$/, {
        message: 'El código 2FA debe tener 6 dígitos',
    })
    twoFactorCode?: string;
}

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty()
    currentPassword!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_COMPLEXITY_REGEX, {
        message: 'La contraseña debe incluir letras y números',
    })
    newPassword!: string;
}

export class RefreshTokenDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    refreshToken!: string;
}

export class TwoFactorCodeDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{6}$/, {
        message: 'El código 2FA debe tener 6 dígitos',
    })
    code!: string;
}
