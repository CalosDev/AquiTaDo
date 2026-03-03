import {
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

interface AuthTokenPayload {
    sub: string;
    role: Role;
}

@Injectable()
export class AuthService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(JwtService)
        private readonly jwtService: JwtService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
    ) { }

    async register(dto: RegisterDto, request: Request, response: Response) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('El correo electronico ya esta registrado');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);

        const user = await this.prisma.user.create({
            data: {
                name: dto.name.trim(),
                email: dto.email.trim().toLowerCase(),
                password: hashedPassword,
                phone: dto.phone?.trim(),
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

        return this.issueAuthSession(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            request,
            response,
        );
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
            throw new UnauthorizedException('Refresh token invalido');
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
                    },
                },
            },
        });

        if (!storedRefreshToken || storedRefreshToken.revokedAt || storedRefreshToken.expiresAt <= new Date()) {
            throw new UnauthorizedException('Refresh token invalido o expirado');
        }

        if (payload.sub !== storedRefreshToken.userId) {
            throw new UnauthorizedException('Refresh token invalido');
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
        return { message: 'Sesion cerrada' };
    }

    private async issueAuthSession(
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
            role: Role;
            createdAt: Date;
            updatedAt: Date;
        },
        request: Request,
        response: Response,
        replacingTokenHash?: string,
    ) {
        const accessToken = this.generateAccessToken(user.id, user.role);
        const refreshToken = this.generateRefreshToken(user.id, user.role);
        const refreshTokenHash = this.hashToken(refreshToken);

        const refreshTtlDays = this.resolveRefreshTokenTtlDays();
        const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);
        const { userAgent, ipAddress } = this.resolveClientMetadata(request);

        await this.prisma.$transaction(async (tx) => {
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
            this.resolveRefreshCookieOptions(),
        );

        return {
            accessToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                createdAt: user.createdAt.toISOString(),
                updatedAt: user.updatedAt.toISOString(),
            },
        };
    }

    private generateAccessToken(userId: string, role: Role): string {
        return this.jwtService.sign({ sub: userId, role });
    }

    private generateRefreshToken(userId: string, role: Role): string {
        const refreshSecret = this.resolveRefreshSecret();
        return this.jwtService.sign(
            { sub: userId, role, jti: randomUUID() },
            {
                secret: refreshSecret,
                expiresIn: `${this.resolveRefreshTokenTtlDays()}d`,
            },
        );
    }

    private verifyRefreshToken(token: string): AuthTokenPayload {
        const refreshSecret = this.resolveRefreshSecret();
        try {
            return this.jwtService.verify<AuthTokenPayload>(token, { secret: refreshSecret });
        } catch {
            throw new UnauthorizedException('Refresh token invalido');
        }
    }

    private resolveRefreshSecret(): string {
        return this.configService.get<string>('JWT_REFRESH_SECRET')
            ?? this.configService.get<string>('JWT_SECRET')
            ?? '';
    }

    private resolveRefreshTokenTtlDays(): number {
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

    private resolveRefreshCookieOptions(): CookieOptions {
        const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
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
            maxAge: this.resolveRefreshTokenTtlDays() * 24 * 60 * 60 * 1000,
            ...(domain ? { domain } : {}),
        };
    }

    private clearRefreshCookie(response: Response): void {
        const cookieOptions = this.resolveRefreshCookieOptions();
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
            throw new UnauthorizedException('Refresh token invalido');
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
