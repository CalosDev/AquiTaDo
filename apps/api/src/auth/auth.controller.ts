import { Controller, Post, Body, HttpCode, HttpStatus, Inject, Req, Res, UseGuards, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto, RegisterDto, LoginDto, RefreshTokenDto, TwoFactorCodeDto } from './dto/auth.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
    constructor(
        @Inject(AuthService)
        private readonly authService: AuthService,
    ) { }

    @Post('register')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async register(
        @Body() dto: RegisterDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        return this.authService.register(dto, request, response);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 8, ttl: 60_000 } })
    async login(
        @Body() dto: LoginDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        return this.authService.login(dto, request, response);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    async refresh(
        @Body() dto: RefreshTokenDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        return this.authService.refresh(dto.refreshToken, request, response);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    async logout(
        @Body() dto: RefreshTokenDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        return this.authService.logout(dto.refreshToken, request, response);
    }

    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 6, ttl: 60_000 } })
    async changePassword(
        @CurrentUser('id') userId: string,
        @Body() dto: ChangePasswordDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        return this.authService.changePassword(userId, dto, response);
    }

    @Get('2fa/status')
    @UseGuards(JwtAuthGuard)
    async getTwoFactorStatus(@CurrentUser('id') userId: string) {
        return this.authService.getTwoFactorStatus(userId);
    }

    @Post('2fa/setup')
    @UseGuards(JwtAuthGuard)
    async setupTwoFactor(@CurrentUser('id') userId: string) {
        return this.authService.setupTwoFactor(userId);
    }

    @Post('2fa/enable')
    @UseGuards(JwtAuthGuard)
    async enableTwoFactor(
        @CurrentUser('id') userId: string,
        @Body() dto: TwoFactorCodeDto,
    ) {
        return this.authService.enableTwoFactor(userId, dto.code);
    }

    @Post('2fa/disable')
    @UseGuards(JwtAuthGuard)
    async disableTwoFactor(
        @CurrentUser('id') userId: string,
        @Body() dto: TwoFactorCodeDto,
    ) {
        return this.authService.disableTwoFactor(userId, dto.code);
    }
}
