import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
    AddBusinessToListDto,
    CreateBusinessListDto,
    ListBusinessListsQueryDto,
    ListFavoriteBusinessesQueryDto,
    ToggleFavoriteBusinessDto,
} from './dto/favorites.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
export class FavoritesController {
    constructor(
        @Inject(FavoritesService)
        private readonly favoritesService: FavoritesService,
    ) { }

    @Get('businesses/my')
    async listFavoriteBusinesses(
        @CurrentUser('id') userId: string,
        @Query() query: ListFavoriteBusinessesQueryDto,
    ) {
        return this.favoritesService.listFavoriteBusinesses(userId, query);
    }

    @Post('businesses/toggle')
    async toggleFavoriteBusiness(
        @CurrentUser('id') userId: string,
        @Body() dto: ToggleFavoriteBusinessDto,
    ) {
        return this.favoritesService.toggleFavoriteBusiness(userId, dto);
    }

    @Get('lists/my')
    async listMyBusinessLists(
        @CurrentUser('id') userId: string,
        @Query() query: ListBusinessListsQueryDto,
    ) {
        return this.favoritesService.listMyBusinessLists(userId, query);
    }

    @Post('lists')
    async createBusinessList(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateBusinessListDto,
    ) {
        return this.favoritesService.createBusinessList(userId, dto);
    }

    @Delete('lists/:listId')
    async deleteBusinessList(
        @CurrentUser('id') userId: string,
        @Param('listId', new ParseUUIDPipe()) listId: string,
    ) {
        return this.favoritesService.deleteBusinessList(userId, listId);
    }

    @Post('lists/:listId/items')
    async addBusinessToList(
        @CurrentUser('id') userId: string,
        @Param('listId', new ParseUUIDPipe()) listId: string,
        @Body() dto: AddBusinessToListDto,
    ) {
        return this.favoritesService.addBusinessToList(userId, listId, dto);
    }

    @Delete('lists/:listId/items/:businessId')
    async removeBusinessFromList(
        @CurrentUser('id') userId: string,
        @Param('listId', new ParseUUIDPipe()) listId: string,
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
    ) {
        return this.favoritesService.removeBusinessFromList(userId, listId, businessId);
    }
}
