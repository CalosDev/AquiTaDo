import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseUUIDPipe,
    UseGuards,
    Inject,
    Header,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
    constructor(
        @Inject(CategoriesService)
        private readonly categoriesService: CategoriesService,
    ) { }

    @Get()
    @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
    async findAll() {
        return this.categoriesService.findAll();
    }

    @Get(':id')
    @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
    async findById(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.categoriesService.findById(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async create(@Body() dto: CreateCategoryDto) {
        return this.categoriesService.create(dto);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async update(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.categoriesService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async delete(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.categoriesService.delete(id);
    }
}
