import {
    BadRequestException,
    ForbiddenException,
    ConflictException,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { CookieOptions, Request, Response } from 'express';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { IntegrationsService } from '../integrations/integrations.service';
import {
    buildTotpOtpauthUrl,
    generateTotpSecret,
    verifyTotpCode,
} from './totp.util';

interface AuthTokenPayload {
    sub: string;
    role: Role;
}

type AuthSessionUser = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
    twoFactorEnabled: boolean;
};

@Injectable()
export class AuthService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(JwtService)
        private readonly jwtService: JwtService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(IntegrationsService)
        private readonly integrationsService: IntegrationsService,
    ) { }

    async register(dto: RegisterDto, request: Request, response: Response) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('El correo electrónico ya está registrado');
        }

        const rawRequestedRole = (dto as { role?: unknown }).role;
        if (
            rawRequestedRole !== undefined
            && rawRequestedRole !== 'USER'
            && rawRequestedRole !== 'BUSINESS_OWNER'
        ) {
            throw new BadRequestException('Rol no permitido para registro público');
        }

        const requestedRole: Role = rawRequestedRole === 'BUSINESS_OWNER' ? 'BUSINESS_OWNER' : 'USER';
        const requestedPhone = dto.phone?.trim();
        let normalizedPhone: string | null = null;
        if (requestedPhone && requestedPhone.length > 0) {
            const phoneValidation = await this.integrationsService.validateDominicanPhone(requestedPhone);
            if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
                throw new BadRequestException('El teléfono debe ser un número dominicano válido');
            }
            normalizedPhone = phoneValidation.normalizedPhone;
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);

        const user = await this.prisma.user.create({
            data: {
                name: dto.name.trim(),
                email: dto.email.trim().toLowerCase(),
                password: hashedPassword,
                phone: normalizedPhone,
                role: requestedRole,
            },
        });

        return this.issueAuthSession(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                twoFactorEnabled: user.twoFactorEnabled,
            },
            request,
            response,
        );
    }

    async login(dto: LoginDto, request: Request, response: Response) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() },
        });

        if (!user) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        this.assertAdminSecondFactor(user.role, user.twoFactorEnabled, user.twoFactorSecret, dto.twoFactorCode);

        const session = await this.issueAuthSession(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                twoFactorEnabled: user.twoFactorEnabled,
            },
            request,
            response,
        );

        if (user.role === 'ADMIN' && !user.twoFactorEnabled) {
            return {
                ...session,
                securityWarnings: ['ADMIN_2FA_NOT_ENABLED'],
            };
        }

        return session;
    }

    async refresh(
        refreshTokenFromBody: string | undefined,
        request: Request,
        response: Response,
    ) {
        const normalizedToken = this.resolveRefreshToken(
            request,
            refreshTokenFromBody,
            true,
        );
        if (!normalizedToken) {
            throw new UnauthorizedException('Refresh token inválido');
        }

        const payload = this.verifyRefreshToken(normalizedToken);
        const refreshTokenHash = this.hashToken(normalizedToken);

        const storedRefreshToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: refreshTokenHash },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        createdAt: true,
                        updatedAt: true,
                        twoFactorEnabled: true,
                    },
                },
            },
        });

        if (!storedRefreshToken || storedRefreshToken.revokedAt || storedRefreshToken.expiresAt <= new Date()) {
            throw new UnauthorizedException('Refresh token inválido o expirado');
        }

        if (payload.sub !== storedRefreshToken.userId) {
            throw new UnauthorizedException('Refresh token inválido');
        }

        return this.issueAuthSession(
            storedRefreshToken.user,
            request,
            response,
            refreshTokenHash,
        );
    }

    async logout(
        refreshTokenFromBody: string | undefined,
        request: Request,
        response: Response,
    ) {
        const normalizedToken = this.resolveRefreshToken(request, refreshTokenFromBody, false);

        if (normalizedToken) {
            const tokenHash = this.hashToken(normalizedToken);
            await this.prisma.refreshToken.updateMany({
                where: {
                    tokenHash,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
        }

        this.clearRefreshCookie(response);
        return { message: 'Sesión cerrada' };
    }

    async getTwoFactorStatus(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                twoFactorEnabled: true,
                twoFactorEnabledAt: true,
                twoFactorPendingSecret: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        const required = user.role === 'ADMIN';
        return {
            enabled: user.twoFactorEnabled,
            pending: Boolean(user.twoFactorPendingSecret),
            required,
            enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
        };
    }

    async setupTwoFactor(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                role: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        if (user.role !== 'ADMIN') {
            throw new ForbiddenException('Solo las cuentas ADMIN pueden configurar 2FA');
        }

        const secret = generateTotpSecret();
        const issuer = this.resolveTotpIssuer();
        const otpauthUrl = buildTotpOtpauthUrl({
            secret,
            issuer,
            accountLabel: user.email,
        });

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                twoFactorPendingSecret: secret,
            },
        });

        return {
            secret,
            otpauthUrl,
            issuer,
            accountLabel: user.email,
            digits: 6,
            periodSeconds: 30,
        };
    }

    async enableTwoFactor(userId: string, code: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                twoFactorPendingSecret: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        if (user.role !== 'ADMIN') {
            throw new ForbiddenException('Solo las cuentas ADMIN pueden habilitar 2FA');
        }

        if (!user.twoFactorPendingSecret) {
            throw new BadRequestException('No hay configuracion 2FA pendiente');
        }

        if (!verifyTotpCode(user.twoFactorPendingSecret, code)) {
            throw new UnauthorizedException('Código 2FA inválido');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    twoFactorEnabled: true,
                    twoFactorSecret: user.twoFactorPendingSecret,
                    twoFactorPendingSecret: null,
                    twoFactorEnabledAt: new Date(),
                },
            });

            await tx.refreshToken.updateMany({
                where: {
                    userId: user.id,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
        });

        return {
            enabled: true,
            message: '2FA habilitado correctamente. Inicia sesión nuevamente.',
        };
    }

    async disableTwoFactor(userId: string, code: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                twoFactorEnabled: true,
                twoFactorSecret: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        if (user.role !== 'ADMIN') {
            throw new ForbiddenException('Solo las cuentas ADMIN pueden deshabilitar 2FA');
        }

        if (!user.twoFactorEnabled || !user.twoFactorSecret) {
            throw new BadRequestException('2FA no está habilitado');
        }

        if (!verifyTotpCode(user.twoFactorSecret, code)) {
            throw new UnauthorizedException('Código 2FA inválido');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    twoFactorEnabled: false,
                    twoFactorSecret: null,
                    twoFactorPendingSecret: null,
                    twoFactorEnabledAt: null,
                },
            });

            await tx.refreshToken.updateMany({
                where: {
                    userId: user.id,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
        });

        return {
            enabled: false,
            message: '2FA deshabilitado. Inicia sesión nuevamente.',
        };
    }

    private async issueAuthSession(
        user: AuthSessionUser,
        request: Request,
        response: Response,
        replacingTokenHash?: string,
    ) {
        const refreshTtlDays = this.resolveRefreshTokenTtlDays(user.role);
        const accessToken = this.generateAccessToken(user.id, user.role);
        const refreshToken = this.generateRefreshToken(user.id, user.role, refreshTtlDays);
        const refreshTokenHash = this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
        const { userAgent, ipAddress } = this.resolveClientMetadata(request);

        await this.prisma.$transaction(async (tx) => {
            if (user.role === 'ADMIN') {
                await tx.refreshToken.updateMany({
                    where: {
                        userId: user.id,
                        revokedAt: null,
                    },
                    data: {
                        revokedAt: new Date(),
                    },
                });
            }

            if (replacingTokenHash) {
                await tx.refreshToken.updateMany({
                    where: {
                        tokenHash: replacingTokenHash,
                        revokedAt: null,
                    },
                    data: {
                        revokedAt: new Date(),
                        replacedByHash: refreshTokenHash,
                    },
                });
            }

            await tx.refreshToken.create({
                data: {
                    userId: user.id,
                    tokenHash: refreshTokenHash,
                    expiresAt,
                    userAgent,
                    ipAddress,
                },
            });
        });

        response.cookie(
            this.resolveRefreshCookieName(),
            refreshToken,
            this.resolveRefreshCookieOptions(refreshTtlDays),
        );

        return {
            accessToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                twoFactorEnabled: user.twoFactorEnabled,
                createdAt: user.createdAt.toISOString(),
                updatedAt: user.updatedAt.toISOString(),
            },
        };
    }

    private generateAccessToken(userId: string, role: Role): string {
        if (role === 'ADMIN') {
            const adminAccessTtl = this.configService.get<string>('JWT_ACCESS_TTL_ADMIN')?.trim() || '10m';
            return this.jwtService.sign(
                { sub: userId, role },
                { expiresIn: adminAccessTtl as never },
            );
        }

        return this.jwtService.sign({ sub: userId, role });
    }

    private generateRefreshToken(userId: string, role: Role, refreshTtlDays: number): string {
        const refreshSecret = this.resolveRefreshSecret();
        return this.jwtService.sign(
            { sub: userId, role, jti: randomUUID() },
            {
                secret: refreshSecret,
                expiresIn: `${refreshTtlDays}d`,
            },
        );
    }

    private verifyRefreshToken(token: string): AuthTokenPayload {
        const refreshSecret = this.resolveRefreshSecret();
        try {
            return this.jwtService.verify<AuthTokenPayload>(token, { secret: refreshSecret });
        } catch {
            throw new UnauthorizedException('Refresh token inválido');
        }
    }

    private resolveRefreshSecret(): string {
        return this.configService.get<string>('JWT_REFRESH_SECRET')
            ?? this.configService.get<string>('JWT_SECRET')
            ?? '';
    }

    private resolveRefreshTokenTtlDays(role: Role): number {
        if (role === 'ADMIN') {
            const configuredAdminDays = Number(this.configService.get<string>('JWT_REFRESH_TTL_ADMIN_DAYS') ?? 7);
            if (!Number.isFinite(configuredAdminDays) || configuredAdminDays <= 0) {
                return 7;
            }
            return Math.floor(configuredAdminDays);
        }

        const configuredDays = Number(this.configService.get<string>('JWT_REFRESH_TTL_DAYS') ?? 30);
        if (!Number.isFinite(configuredDays) || configuredDays <= 0) {
            return 30;
        }

        return Math.floor(configuredDays);
    }

    private resolveRefreshCookieName(): string {
        const configuredName = this.configService.get<string>('AUTH_REFRESH_COOKIE_NAME')?.trim();
        return configuredName && configuredName.length > 0
            ? configuredName
            : 'aquita_refresh_token';
    }

    private resolveRefreshCookieOptions(refreshTtlDays: number): CookieOptions {
        const isProduction = (this.configService.get<string>('NODE_ENV') ?? '').trim().toLowerCase() === 'production';
        const configuredSameSite = (this.configService.get<string>('AUTH_REFRESH_COOKIE_SAMESITE') ?? '')
            .trim()
            .toLowerCase();
        const sameSite: 'lax' | 'strict' | 'none' = configuredSameSite === 'strict'
            ? 'strict'
            : configuredSameSite === 'none'
                ? 'none'
                : configuredSameSite === 'lax'
                    ? 'lax'
                    : isProduction
                        ? 'none'
                        : 'lax';

        const secureConfig = this.configService.get<string>('AUTH_REFRESH_COOKIE_SECURE');
        const secure = secureConfig !== undefined
            ? ['1', 'true'].includes(secureConfig.trim().toLowerCase())
            : (sameSite === 'none' || isProduction);

        const domain = this.configService.get<string>('AUTH_REFRESH_COOKIE_DOMAIN')?.trim() || undefined;
        const path = this.configService.get<string>('AUTH_REFRESH_COOKIE_PATH')?.trim() || '/api/auth';

        return {
            httpOnly: true,
            secure,
            sameSite,
            path,
            maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
            ...(domain ? { domain } : {}),
        };
    }

    private clearRefreshCookie(response: Response): void {
        const cookieOptions = this.resolveRefreshCookieOptions(1);
        response.clearCookie(this.resolveRefreshCookieName(), {
            httpOnly: true,
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            path: cookieOptions.path,
            ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
        });
    }

    private resolveRefreshToken(
        request: Request,
        refreshTokenFromBody: string | undefined,
        required: boolean,
    ): string | null {
        const explicitToken = refreshTokenFromBody?.trim();
        if (explicitToken) {
            return explicitToken;
        }

        const cookieName = this.resolveRefreshCookieName();
        const cookieToken = this.readCookieValue(request.headers.cookie, cookieName);
        if (cookieToken) {
            return cookieToken;
        }

        if (required) {
            throw new UnauthorizedException('Refresh token inválido');
        }

        return null;
    }

    private readCookieValue(cookieHeader: string | undefined, key: string): string | null {
        if (!cookieHeader || cookieHeader.trim().length === 0) {
            return null;
        }

        const segments = cookieHeader.split(';');
        for (const segment of segments) {
            const [rawName, ...rawValueParts] = segment.trim().split('=');
            if (!rawName || rawName !== key || rawValueParts.length === 0) {
                continue;
            }

            const rawValue = rawValueParts.join('=');
            try {
                return decodeURIComponent(rawValue).trim();
            } catch {
                return rawValue.trim();
            }
        }

        return null;
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private resolveTotpIssuer(): string {
        const configuredIssuer = this.configService.get<string>('TOTP_ISSUER')?.trim();
        return configuredIssuer && configuredIssuer.length > 0
            ? configuredIssuer
            : 'AquiTa.do';
    }

    private assertAdminSecondFactor(
        role: Role,
        twoFactorEnabled: boolean,
        twoFactorSecret: string | null,
        twoFactorCode?: string,
    ): void {
        if (role !== 'ADMIN') {
            return;
        }

        if (!twoFactorEnabled || !twoFactorSecret) {
            return;
        }

        const normalizedCode = twoFactorCode?.trim();
        if (!normalizedCode) {
            throw new UnauthorizedException('Se requiere codigo 2FA para cuentas admin');
        }

        if (!verifyTotpCode(twoFactorSecret, normalizedCode)) {
            throw new UnauthorizedException('Código 2FA inválido');
        }
    }

    private resolveClientMetadata(request: Request): {
        userAgent: string | null;
        ipAddress: string | null;
    } {
        const forwardedFor = request.headers['x-forwarded-for'];
        const forwardedIp = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : typeof forwardedFor === 'string'
                ? forwardedFor.split(',')[0]?.trim()
                : null;

        const ip = forwardedIp || request.ip || null;
        const userAgent = request.headers['user-agent']?.slice(0, 255) ?? null;

        return {
            userAgent,
            ipAddress: ip ? ip.slice(0, 120) : null,
        };
    }
}
