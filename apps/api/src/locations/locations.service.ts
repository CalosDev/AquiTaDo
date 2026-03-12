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
        const cities = await this.prisma.city.findMany({
            where: { provinceId },
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { sectors: true },
                },
            },
        });

        const groupedBusinessCounts = await this.prisma.business.groupBy({
            by: ['cityId'],
            where: {
                deletedAt: null,
                verified: true,
                cityId: {
                    in: cities.map((city) => city.id),
                },
            },
            _count: {
                _all: true,
            },
        });

        const businessCountByCityId = new Map(
            groupedBusinessCounts.map((row) => [row.cityId, row._count._all]),
        );

        return cities.map((city) => ({
            ...city,
            _count: {
                sectors: city._count.sectors,
                businesses: businessCountByCityId.get(city.id) ?? 0,
            },
        }));
    }

    async findAllCities() {
        return this.prisma.city.findMany({
            orderBy: { name: 'asc' },
            include: { province: true },
        });
    }

    async findSectorsByCity(cityId: string) {
        const sectors = await this.prisma.sector.findMany({
            where: { cityId },
            orderBy: { name: 'asc' },
        });

        const groupedBusinessCounts = await this.prisma.business.groupBy({
            by: ['sectorId'],
            where: {
                deletedAt: null,
                verified: true,
                sectorId: {
                    in: sectors.map((sector) => sector.id),
                },
            },
            _count: {
                _all: true,
            },
        });

        const businessCountBySectorId = new Map(
            groupedBusinessCounts.map((row) => [row.sectorId, row._count._all]),
        );

        return sectors.map((sector) => ({
            ...sector,
            _count: {
                businesses: businessCountBySectorId.get(sector.id) ?? 0,
            },
        }));
    }
}
