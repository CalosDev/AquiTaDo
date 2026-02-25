import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
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
    ) {
        return this.usersService.updateMyProfile(userId, dto);
    }

    @Get('me/profile')
    @UseGuards(JwtAuthGuard)
    async getMyProfileDetails(@CurrentUser('id') userId: string) {
        return this.usersService.getMyProfileDetails(userId);
    }
}
