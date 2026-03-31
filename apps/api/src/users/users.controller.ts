import { BadRequestException, Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
    constructor(
        @Inject(UsersService)
        private readonly usersService: UsersService,
    ) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    async updateMyProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateMyProfileDto,
        @Req() request: Request,
    ) {
        if (Object.prototype.hasOwnProperty.call(request.body ?? {}, 'avatarUrl')) {
            throw new BadRequestException(
                'La foto de perfil se actualiza mediante el flujo de carga gestionada',
            );
        }

        return this.usersService.updateMyProfile(userId, dto);
    }

    @Get('me/profile')
    @UseGuards(JwtAuthGuard)
    async getMyProfileDetails(@CurrentUser('id') userId: string) {
        return this.usersService.getMyProfileDetails(userId);
    }
}
