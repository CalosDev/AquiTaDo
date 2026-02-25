import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
    constructor(private prisma: PrismaService) { }

    async findAllProvinces() {
        return this.prisma.province.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { cities: true, businesses: true },
                },
            },
        });
    }

    async findCitiesByProvince(provinceId: string) {
        return this.prisma.city.findMany({
            where: { provinceId },
            orderBy: { name: 'asc' },
        });
    }

    async findAllCities() {
        return this.prisma.city.findMany({
            orderBy: { name: 'asc' },
            include: { province: true },
        });
    }
}
