import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Inject } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('categories')
export class CategoriesController {
    constructor(
        @Inject(CategoriesService)
        private readonly categoriesService: CategoriesService,
    ) { }

    @Get()
    async findAll() {
        return this.categoriesService.findAll();
    }

    @Get(':id')
    async findById(@Param('id') id: string) {
        return this.categoriesService.findById(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async create(@Body() data: { name: string; slug: string; icon?: string }) {
        return this.categoriesService.create(data);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async update(@Param('id') id: string, @Body() data: { name?: string; slug?: string; icon?: string }) {
        return this.categoriesService.update(id, data);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async delete(@Param('id') id: string) {
        return this.categoriesService.delete(id);
    }
}
