import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';

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
}
