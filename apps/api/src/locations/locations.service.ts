import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    async findAllProvinces() {
        const provinces = await this.prisma.province.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { cities: true },
                },
            },
        });

        const groupedBusinessCounts = await this.prisma.business.groupBy({
            by: ['provinceId'],
            where: {
                deletedAt: null,
                verified: true,
                provinceId: {
                    in: provinces.map((province) => province.id),
                },
            },
            _count: {
                _all: true,
            },
        });

        const businessCountByProvinceId = new Map(
            groupedBusinessCounts.map((row) => [row.provinceId, row._count._all]),
        );

        return provinces.map((province) => ({
            ...province,
            _count: {
                cities: province._count.cities,
                businesses: businessCountByProvinceId.get(province.id) ?? 0,
            },
        }));
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
