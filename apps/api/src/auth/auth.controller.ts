import { Controller, Post, Body, HttpCode, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { Request, Response } from 'express';

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
}
