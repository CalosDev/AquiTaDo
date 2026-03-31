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
        message: 'La contrasena debe incluir letras y numeros',
    })
    password!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsOptional()
    @IsString()
    @Matches(/^[0-9+()\-\s]{7,20}$/, {
        message: 'El telefono no tiene un formato valido',
    })
    phone?: string;

    @IsOptional()
    @IsIn(['USER', 'BUSINESS_OWNER'])
    role?: 'USER' | 'BUSINESS_OWNER';
}

export class LoginDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    email!: string;

    @IsString()
    @IsNotEmpty()
    password!: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{6}$/, {
        message: 'El codigo 2FA debe tener 6 digitos',
    })
    twoFactorCode?: string;
}

export class GoogleAuthDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MinLength(20)
    idToken!: string;

    @IsOptional()
    @IsIn(['USER', 'BUSINESS_OWNER'])
    role?: 'USER' | 'BUSINESS_OWNER';

    @IsOptional()
    @IsString()
    @Matches(/^\d{6}$/, {
        message: 'El codigo 2FA debe tener 6 digitos',
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
        message: 'La contrasena debe incluir letras y numeros',
    })
    newPassword!: string;
}

export class ForgotPasswordDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    @MaxLength(120)
    email!: string;
}

export class ResetPasswordDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MinLength(20)
    @MaxLength(255)
    token!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(PASSWORD_COMPLEXITY_REGEX, {
        message: 'La contrasena debe incluir letras y numeros',
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
        message: 'El codigo 2FA debe tener 6 digitos',
    })
    code!: string;
}
