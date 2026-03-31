import {
    BadRequestException,
    ForbiddenException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { CookieOptions, Request, Response } from 'express';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, GoogleAuthDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { IntegrationsService } from '../integrations/integrations.service';
import { ObservabilityService } from '../observability/observability.service';
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
    avatarUrl: string | null;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
    twoFactorEnabled: boolean;
};

type GoogleIdentityPayload = {
    subject: string;
    email: string;
    name: string;
    avatarUrl: string | null;
};

type GoogleTokenInfoResponse = {
    aud?: string;
    azp?: string;
    email?: string;
    email_verified?: boolean | string;
    exp?: string;
    iss?: string;
    name?: string;
    picture?: string;
    sub?: string;
};

const authSessionBaseSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatarUrl: true,
    role: true,
    createdAt: true,
    updatedAt: true,
} as const;

const authLoginSelect = {
    ...authSessionBaseSelect,
    password: true,
} as const;

const authAdminSecondFactorSelect = {
    id: true,
    twoFactorEnabled: true,
    twoFactorSecret: true,
} as const;

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(JwtService)
        private readonly jwtService: JwtService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(IntegrationsService)
        private readonly integrationsService: IntegrationsService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) { }

    async register(dto: RegisterDto, request: Request, response: Response) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() },
            select: { id: true },
        });

        if (existingUser) {
            throw new ConflictException('El correo electronico ya esta registrado');
        }

        const requestedRole = this.resolveRequestedRole(dto.role);
        const requestedPhone = dto.phone?.trim();
        let normalizedPhone: string | null = null;
        if (requestedPhone && requestedPhone.length > 0) {
            const phoneValidation = await this.integrationsService.validateDominicanPhone(requestedPhone);
            if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
                throw new BadRequestException('El telefono debe ser un numero dominicano valido');
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
            select: authSessionBaseSelect,
        });

        return this.issueAuthSession(
            this.toAuthSessionUser({
                ...user,
                twoFactorEnabled: false,
            }),
            request,
            response,
        );
    }

    async login(dto: LoginDto, request: Request, response: Response) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() },
            select: authLoginSelect,
        });

        if (!user) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        if (!user.password || typeof user.password !== 'string') {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales invalidas');
        }

        let twoFactorEnabled = false;
        if (user.role === 'ADMIN') {
            const adminSecurity = await this.prisma.user.findUnique({
                where: { id: user.id },
                select: authAdminSecondFactorSelect,
            });

            if (!adminSecurity) {
                throw new UnauthorizedException('Credenciales invalidas');
            }

            twoFactorEnabled = adminSecurity.twoFactorEnabled;
            this.assertAdminSecondFactor(
                user.role,
                adminSecurity.twoFactorEnabled,
                adminSecurity.twoFactorSecret,
                dto.twoFactorCode,
            );
        }

        const session = await this.issueAuthSession(
            this.toAuthSessionUser({
                ...user,
                twoFactorEnabled,
            }),
            request,
            response,
        );

        if (user.role === 'ADMIN' && !twoFactorEnabled) {
            return {
                ...session,
                securityWarnings: ['ADMIN_2FA_NOT_ENABLED'],
            };
        }

        return session;
    }

    async authenticateWithGoogle(dto: GoogleAuthDto, request: Request, response: Response) {
        const googleIdentity = await this.verifyGoogleIdToken(dto.idToken);
        const requestedRole = this.resolveRequestedRole(dto.role);
        const user = await this.findOrCreateUserFromGoogleIdentity(googleIdentity, requestedRole);

        this.assertAdminSecondFactor(
            user.role,
            user.twoFactorEnabled,
            user.twoFactorSecret,
            dto.twoFactorCode,
        );

        const session = await this.issueAuthSession(this.toAuthSessionUser(user), request, response);

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
                        avatarUrl: true,
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

    async changePassword(userId: string, dto: ChangePasswordDto, response: Response) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                password: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Usuario no autenticado');
        }

        const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            throw new UnauthorizedException('La contrasena actual no es correcta');
        }

        if (dto.currentPassword === dto.newPassword) {
            throw new BadRequestException('La nueva contrasena debe ser diferente a la actual');
        }

        const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    password: hashedPassword,
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

        this.clearRefreshCookie(response);
        return { message: 'Contrasena actualizada. Inicia sesion nuevamente.' };
    }

    async requestPasswordReset(email: string) {
        const normalizedEmail = email.trim().toLowerCase();
        const genericResponse = {
            message: 'Si el correo existe, enviaremos un enlace para restablecer la contrasena.',
        };

        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: {
                id: true,
                name: true,
                email: true,
            },
        });

        if (!user) {
            return genericResponse;
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + this.resolvePasswordResetTtlMinutes() * 60 * 1000);
        const resetUrl = this.buildPasswordResetUrl(rawToken);

        await this.prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.deleteMany({
                where: {
                    userId: user.id,
                },
            });

            await tx.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    expiresAt,
                },
            });
        });

        await this.sendPasswordResetLink({
            name: user.name,
            email: user.email,
            resetUrl,
            expiresAt,
        });

        if (this.isPasswordResetDebugEnabled()) {
            return {
                ...genericResponse,
                debugResetToken: rawToken,
                debugResetUrl: resetUrl,
            };
        }

        return genericResponse;
    }

    async resetPassword(token: string, newPassword: string) {
        const normalizedToken = token.trim();
        const tokenHash = this.hashToken(normalizedToken);

        const resetToken = await this.prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            select: {
                id: true,
                userId: true,
                expiresAt: true,
                usedAt: true,
                user: {
                    select: {
                        id: true,
                        password: true,
                    },
                },
            },
        });

        if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
            throw new BadRequestException('El enlace de recuperacion no es valido o ya expiro');
        }

        const isSamePassword = await bcrypt.compare(newPassword, resetToken.user.password);
        if (isSamePassword) {
            throw new BadRequestException('La nueva contrasena debe ser diferente a la actual');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: resetToken.userId },
                data: {
                    password: hashedPassword,
                },
            });

            await tx.passwordResetToken.update({
                where: { id: resetToken.id },
                data: {
                    usedAt: new Date(),
                },
            });

            await tx.passwordResetToken.deleteMany({
                where: {
                    userId: resetToken.userId,
                    id: { not: resetToken.id },
                },
            });

            await tx.refreshToken.updateMany({
                where: {
                    userId: resetToken.userId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
        });

        return { message: 'Contrasena restablecida. Inicia sesion con la nueva clave.' };
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
            throw new UnauthorizedException('Codigo 2FA invalido');
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
            message: '2FA habilitado correctamente. Inicia sesion nuevamente.',
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
            throw new BadRequestException('2FA no esta habilitado');
        }

        if (!verifyTotpCode(user.twoFactorSecret, code)) {
            throw new UnauthorizedException('Codigo 2FA invalido');
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
            message: '2FA deshabilitado. Inicia sesion nuevamente.',
        };
    }

    private resolveRequestedRole(role?: unknown): Role {
        if (role !== undefined && role !== 'USER' && role !== 'BUSINESS_OWNER') {
            throw new BadRequestException('Rol no permitido para registro publico');
        }

        return role === 'BUSINESS_OWNER' ? 'BUSINESS_OWNER' : 'USER';
    }

    private toAuthSessionUser(user: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        avatarUrl?: string | null;
        role: Role;
        createdAt: Date;
        updatedAt: Date;
        twoFactorEnabled: boolean;
    }): AuthSessionUser {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatarUrl: user.avatarUrl ?? null,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            twoFactorEnabled: user.twoFactorEnabled,
        };
    }

    private async verifyGoogleIdToken(idToken: string): Promise<GoogleIdentityPayload> {
        const googleClientId = this.resolveGoogleClientId();
        const requestUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
        requestUrl.searchParams.set('id_token', idToken.trim());

        let googleResponse: globalThis.Response;
        try {
            googleResponse = await fetch(requestUrl, {
                method: 'GET',
            });
        } catch (error) {
            this.logger.warn(
                `Google identity verification failed (${error instanceof Error ? error.message : String(error)})`,
            );
            throw new UnauthorizedException('No se pudo validar la identidad de Google');
        }

        if (!googleResponse.ok) {
            throw new UnauthorizedException('Token de Google invalido');
        }

        const payload = await googleResponse.json() as GoogleTokenInfoResponse;
        const audience = String(payload.aud ?? '').trim();
        const issuer = String(payload.iss ?? '').trim();
        const subject = String(payload.sub ?? '').trim();
        const email = String(payload.email ?? '').trim().toLowerCase();
        const emailVerified = payload.email_verified === true
            || String(payload.email_verified ?? '').trim().toLowerCase() === 'true';

        if (audience !== googleClientId) {
            throw new UnauthorizedException('Token de Google invalido');
        }

        if (
            issuer.length > 0
            && issuer !== 'accounts.google.com'
            && issuer !== 'https://accounts.google.com'
        ) {
            throw new UnauthorizedException('Token de Google invalido');
        }

        if (!subject || !email || !emailVerified) {
            throw new UnauthorizedException('La cuenta de Google no pudo ser verificada');
        }

        const candidateAvatarUrl = String(payload.picture ?? '').trim();
        const avatarUrl = /^https?:\/\//i.test(candidateAvatarUrl)
            ? candidateAvatarUrl
            : null;

        return {
            subject,
            email,
            name: String(payload.name ?? '').trim() || email.split('@')[0] || 'Usuario Google',
            avatarUrl,
        };
    }

    private resolveGoogleClientId(): string {
        const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID')?.trim();
        if (!clientId) {
            throw new BadRequestException('Google sign-in no esta configurado');
        }

        return clientId;
    }

    private async findOrCreateUserFromGoogleIdentity(
        identity: GoogleIdentityPayload,
        requestedRole: Role,
    ) {
        const authSelect = {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            googleSubject: true,
        } as const;

        const existingByGoogleSubject = await this.prisma.user.findUnique({
            where: { googleSubject: identity.subject },
            select: authSelect,
        });

        if (existingByGoogleSubject) {
            const emailChanged = existingByGoogleSubject.email !== identity.email;
            let nextEmail = existingByGoogleSubject.email;

            if (emailChanged) {
                const emailOwner = await this.prisma.user.findUnique({
                    where: { email: identity.email },
                    select: { id: true },
                });

                if (!emailOwner || emailOwner.id === existingByGoogleSubject.id) {
                    nextEmail = identity.email;
                }
            }

            const shouldFillAvatar = !existingByGoogleSubject.avatarUrl && Boolean(identity.avatarUrl);
            if (nextEmail !== existingByGoogleSubject.email || shouldFillAvatar) {
                return this.prisma.user.update({
                    where: { id: existingByGoogleSubject.id },
                    data: {
                        ...(nextEmail !== existingByGoogleSubject.email ? { email: nextEmail } : {}),
                        ...(shouldFillAvatar ? { avatarUrl: identity.avatarUrl } : {}),
                    },
                    select: authSelect,
                });
            }

            return existingByGoogleSubject;
        }

        const existingByEmail = await this.prisma.user.findUnique({
            where: { email: identity.email },
            select: authSelect,
        });

        if (existingByEmail) {
            if (
                existingByEmail.googleSubject
                && existingByEmail.googleSubject !== identity.subject
            ) {
                throw new ConflictException('Este correo ya esta vinculado a otra cuenta de Google');
            }

            return this.prisma.user.update({
                where: { id: existingByEmail.id },
                data: {
                    googleSubject: identity.subject,
                    ...(!existingByEmail.avatarUrl && identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
                },
                select: authSelect,
            });
        }

        const generatedPassword = await bcrypt.hash(randomBytes(24).toString('hex'), 12);

        return this.prisma.user.create({
            data: {
                name: identity.name,
                email: identity.email,
                googleSubject: identity.subject,
                password: generatedPassword,
                avatarUrl: identity.avatarUrl,
                role: requestedRole,
            },
            select: authSelect,
        });
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
                avatarUrl: user.avatarUrl,
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
            throw new UnauthorizedException('Refresh token invalido');
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

    private resolvePasswordResetTtlMinutes(): number {
        const configuredMinutes = Number(this.configService.get<string>('AUTH_PASSWORD_RESET_TTL_MINUTES') ?? 60);
        if (!Number.isFinite(configuredMinutes) || configuredMinutes <= 0) {
            return 60;
        }

        return Math.floor(configuredMinutes);
    }

    private buildPasswordResetUrl(rawToken: string): string {
        const baseUrl = this.configService.get<string>('APP_PUBLIC_WEB_URL')?.trim() || 'http://localhost:5173';
        const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
        return `${normalizedBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    }

    private isPasswordResetDebugEnabled(): boolean {
        const value = this.configService.get<string>('AUTH_DEBUG_RESET_TOKENS')?.trim().toLowerCase();
        return value === '1' || value === 'true';
    }

    private async sendPasswordResetLink(input: {
        name: string;
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }): Promise<void> {
        const startedAt = Date.now();
        const resendApiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
        const resendFromEmail = this.configService.get<string>('RESEND_FROM_EMAIL')?.trim();
        const resendReplyToEmail = this.configService.get<string>('RESEND_REPLY_TO_EMAIL')?.trim();
        const expiresAtLabel = input.expiresAt.toLocaleString('es-DO', { hour12: false });

        if (!resendApiKey || !resendFromEmail) {
            this.logger.warn(
                `Password reset requested for ${input.email} but email provider is not configured. Reset URL: ${input.resetUrl}`,
            );
            return;
        }

        let success = false;
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: resendFromEmail,
                    to: [input.email],
                    ...(resendReplyToEmail ? { reply_to: resendReplyToEmail } : {}),
                    subject: 'Restablece tu contrasena de AquiTa.do',
                    html: [
                        `<p>Hola ${this.escapeHtml(input.name || 'usuario')},</p>`,
                        '<p>Recibimos una solicitud para restablecer tu contrasena en AquiTa.do.</p>',
                        `<p><a href="${this.escapeHtml(input.resetUrl)}">Restablecer contrasena</a></p>`,
                        `<p>Este enlace vence el ${this.escapeHtml(expiresAtLabel)}.</p>`,
                        '<p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>',
                    ].join(''),
                    text: [
                        `Hola ${input.name || 'usuario'},`,
                        '',
                        'Recibimos una solicitud para restablecer tu contrasena en AquiTa.do.',
                        `Abre este enlace: ${input.resetUrl}`,
                        `Este enlace vence el ${expiresAtLabel}.`,
                        '',
                        'Si no solicitaste este cambio, puedes ignorar este mensaje.',
                    ].join('\n'),
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                this.logger.warn(`Failed to send password reset email: HTTP ${response.status} ${errorBody}`);
            } else {
                success = true;
            }
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'email',
                'password_reset_link',
                Date.now() - startedAt,
                success,
            );
        }
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

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
            throw new UnauthorizedException('Codigo 2FA invalido');
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
