import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const RD_DIVISIONS_DEFAULT_URL = 'https://rawcdn.githack.com/kamikazechaser/administrative-divisions-db/master/api/DO.json';

const PROVINCES_FALLBACK = [
    'Azua',
    'Bahoruco',
    'Barahona',
    'Dajabón',
    'Distrito Nacional',
    'Duarte',
    'El Seibo',
    'Elías Piña',
    'Espaillat',
    'Hato Mayor',
    'Hermanas Mirabal',
    'Independencia',
    'La Altagracia',
    'La Romana',
    'La Vega',
    'María Trinidad Sánchez',
    'Monseñor Nouel',
    'Monte Cristi',
    'Monte Plata',
    'Pedernales',
    'Peravia',
    'Puerto Plata',
    'Samaná',
    'San Cristóbal',
    'San José de Ocoa',
    'San Juan',
    'San Pedro de Macorís',
    'Sánchez Ramírez',
    'Santiago',
    'Santiago Rodríguez',
    'Santo Domingo',
    'Valverde',
] as const;

const PROVINCE_ALIASES: Record<string, string> = {
    nacional: 'Distrito Nacional',
    baoruco: 'Bahoruco',
    'el seibo': 'El Seibo',
};

function normalizeText(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toSlug(name: string): string {
    return normalizeText(name)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');
}

function canonicalizeProvinceName(rawName: string): string {
    const normalized = normalizeText(rawName);
    const aliasKey = normalized.toLowerCase();

    if (PROVINCE_ALIASES[aliasKey]) {
        return PROVINCE_ALIASES[aliasKey];
    }

    const fallbackMatch = PROVINCES_FALLBACK.find(
        (candidate) => normalizeText(candidate).toLowerCase() === aliasKey,
    );
    if (fallbackMatch) {
        return fallbackMatch;
    }

    return normalized;
}

async function loadProvincesFromAdministrativeDivisionsDb(): Promise<string[] | null> {
    const sourceUrl = process.env['RD_DIVISIONS_API_URL']?.trim() || RD_DIVISIONS_DEFAULT_URL;
    const timeoutMs = Number(process.env['EXTERNAL_DATA_TIMEOUT_MS'] ?? 3500);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return null;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const response = await fetch(sourceUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: abortController.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
            throw new Error('invalid payload');
        }

        const provinces = payload
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map(canonicalizeProvinceName);

        const uniqueProvinces = [...new Set(provinces)];
        if (uniqueProvinces.length < 20) {
            throw new Error('insufficient province records');
        }

        return uniqueProvinces;
    } catch (error) {
        console.warn(
            `[seed] Administrative divisions source unavailable (${error instanceof Error ? error.message : String(error)}), using fallback province list`,
        );
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function deduplicateFeaturesByName() {
    const duplicates = await prisma.feature.groupBy({
        by: ['name'],
        _count: { name: true },
        having: {
            name: {
                _count: {
                    gt: 1,
                },
            },
        },
    });

    for (const duplicate of duplicates) {
        const entries = await prisma.feature.findMany({
            where: { name: duplicate.name },
            select: { id: true },
            orderBy: { id: 'asc' },
        });

        const keeperId = entries[0]?.id;
        const duplicateIds = entries.slice(1).map((entry) => entry.id);
        if (!keeperId || duplicateIds.length === 0) {
            continue;
        }

        for (const duplicateId of duplicateIds) {
            await prisma.$executeRaw`
                INSERT INTO "business_features" ("businessId", "featureId")
                SELECT "businessId", ${keeperId}
                FROM "business_features"
                WHERE "featureId" = ${duplicateId}
                ON CONFLICT DO NOTHING
            `;

            await prisma.businessFeature.deleteMany({
                where: { featureId: duplicateId },
            });

            await prisma.feature.delete({
                where: { id: duplicateId },
            });
        }
    }
}

async function main() {
    console.log('[seed] Seeding AquiTa.do database...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin12345', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@aquita.do' },
        update: {},
        create: {
            name: 'Admin AquiTa',
            email: 'admin@aquita.do',
            password: adminPassword,
            role: 'ADMIN',
        },
    });
    console.log('[ok] Admin user created:', admin.email);

    const plans = [
        {
            code: 'FREE',
            name: 'Free',
            description: 'Plan inicial para presencia digital básica',
            priceMonthly: '0',
            currency: 'DOP',
            transactionFeeBps: 1200,
            maxBusinesses: 1,
            maxMembers: 3,
            maxImagesPerBusiness: 10,
            maxPromotions: 1,
            analyticsRetentionDays: 30,
            active: true,
        },
        {
            code: 'GROWTH',
            name: 'Pro',
            description: 'Plan para negocios en crecimiento con mayor visibilidad',
            priceMonthly: '1990',
            currency: 'DOP',
            transactionFeeBps: 800,
            maxBusinesses: 5,
            maxMembers: 15,
            maxImagesPerBusiness: 50,
            maxPromotions: 10,
            analyticsRetentionDays: 365,
            active: true,
        },
        {
            code: 'SCALE',
            name: 'Premium',
            description: 'Plan avanzado con capacidad y soporte preferencial',
            priceMonthly: '4990',
            currency: 'DOP',
            transactionFeeBps: 500,
            maxBusinesses: null,
            maxMembers: null,
            maxImagesPerBusiness: null,
            maxPromotions: null,
            analyticsRetentionDays: null,
            active: true,
        },
    ] as const;

    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { code: plan.code },
            update: {
                name: plan.name,
                description: plan.description,
                priceMonthly: plan.priceMonthly,
                currency: plan.currency,
                transactionFeeBps: plan.transactionFeeBps,
                maxBusinesses: plan.maxBusinesses,
                maxMembers: plan.maxMembers,
                maxImagesPerBusiness: plan.maxImagesPerBusiness,
                maxPromotions: plan.maxPromotions,
                analyticsRetentionDays: plan.analyticsRetentionDays,
                active: plan.active,
            },
            create: {
                code: plan.code,
                name: plan.name,
                description: plan.description,
                priceMonthly: plan.priceMonthly,
                currency: plan.currency,
                transactionFeeBps: plan.transactionFeeBps,
                maxBusinesses: plan.maxBusinesses,
                maxMembers: plan.maxMembers,
                maxImagesPerBusiness: plan.maxImagesPerBusiness,
                maxPromotions: plan.maxPromotions,
                analyticsRetentionDays: plan.analyticsRetentionDays,
                active: plan.active,
            },
        });
    }
    console.log(`[ok] ${plans.length} plans created`);

    // Create categories
    const categories = [
        { name: 'Restaurantes', slug: 'restaurantes', icon: '🍽️' },
        { name: 'Hoteles', slug: 'hoteles', icon: '🏨' },
        { name: 'Tiendas', slug: 'tiendas', icon: '🛍️' },
        { name: 'Salud', slug: 'salud', icon: '🏥' },
        { name: 'Educación', slug: 'educacion', icon: '🎓' },
        { name: 'Tecnología', slug: 'tecnologia', icon: '💻' },
        { name: 'Belleza', slug: 'belleza', icon: '💇' },
        { name: 'Deportes', slug: 'deportes', icon: '⚽' },
        { name: 'Automotriz', slug: 'automotriz', icon: '🚗' },
        { name: 'Construcción', slug: 'construccion', icon: '🏗️' },
        { name: 'Legal', slug: 'legal', icon: '⚖️' },
        { name: 'Entretenimiento', slug: 'entretenimiento', icon: '🎭' },
        { name: 'Supermercados', slug: 'supermercados', icon: '🛒' },
        { name: 'Finanzas', slug: 'finanzas', icon: '🏦' },
        { name: 'Inmobiliaria', slug: 'inmobiliaria', icon: '🏠' },
    ];

    for (const cat of categories) {
        await prisma.category.upsert({
            where: { slug: cat.slug },
            update: {},
            create: cat,
        });
    }
    console.log(`[ok] ${categories.length} categories created`);

    const dominicanLocalCategories = [
        { name: 'Colmados', slug: 'colmados', icon: '🏪' },
        { name: 'Farmacias', slug: 'farmacias', icon: '💊' },
        { name: 'Salones y Barberias', slug: 'salones-barberias', icon: '💈' },
        { name: 'Ferreterias', slug: 'ferreterias', icon: '🔧' },
    ];

    for (const localCategory of dominicanLocalCategories) {
        await prisma.category.upsert({
            where: { slug: localCategory.slug },
            update: {
                name: localCategory.name,
                icon: localCategory.icon,
            },
            create: localCategory,
        });
    }
    console.log(`[ok] ${dominicanLocalCategories.length} Dominican local categories ensured`);

    const additionalDominicanLocalCategories = [
        { name: 'Pica Pollos', slug: 'pica-pollos', icon: 'PP' },
        { name: 'Talleres', slug: 'talleres', icon: 'TL' },
        { name: 'Consultorios', slug: 'consultorios', icon: 'CS' },
        { name: 'Mini Markets', slug: 'mini-markets', icon: 'MM' },
    ];

    for (const category of additionalDominicanLocalCategories) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: {
                name: category.name,
                icon: category.icon,
            },
            create: category,
        });
    }
    console.log(`[ok] ${additionalDominicanLocalCategories.length} additional local categories ensured`);

    const categoryParentAssignments = [
        { parentSlug: 'restaurantes', childSlug: 'colmados' },
        { parentSlug: 'restaurantes', childSlug: 'pica-pollos' },
        { parentSlug: 'salud', childSlug: 'farmacias' },
        { parentSlug: 'salud', childSlug: 'consultorios' },
        { parentSlug: 'belleza', childSlug: 'salones-barberias' },
        { parentSlug: 'construccion', childSlug: 'ferreterias' },
        { parentSlug: 'automotriz', childSlug: 'talleres' },
        { parentSlug: 'tiendas', childSlug: 'mini-markets' },
    ] as const;

    for (const assignment of categoryParentAssignments) {
        const parent = await prisma.category.findUnique({
            where: { slug: assignment.parentSlug },
            select: { id: true },
        });
        if (!parent) {
            continue;
        }

        await prisma.category.update({
            where: { slug: assignment.childSlug },
            data: { parentId: parent.id },
        });
    }
    console.log(`[ok] ${categoryParentAssignments.length} category parent relationships ensured`);

    // Create provinces
    const provincesFromApi = await loadProvincesFromAdministrativeDivisionsDb();
    const provinces = provincesFromApi ?? [...PROVINCES_FALLBACK];
    const createdProvincesBySlug: Record<string, string> = {};

    for (const name of provinces) {
        const slug = toSlug(name);
        const province = await prisma.province.upsert({
            where: { slug },
            update: { name },
            create: { name, slug },
        });
        createdProvincesBySlug[slug] = province.id;
    }
    console.log(`[ok] ${provinces.length} provinces created/updated`);

    // Create cities for major provinces
    const citiesData: Record<string, string[]> = {
        'Distrito Nacional': ['Santo Domingo de Guzmán'],
        'Santo Domingo': ['Santo Domingo Este', 'Santo Domingo Norte', 'Santo Domingo Oeste', 'Los Alcarrizos', 'Pedro Brand', 'Boca Chica'],
        'Santiago': ['Santiago de los Caballeros', 'San José de las Matas', 'Tamboril', 'Villa González'],
        'La Vega': ['La Vega', 'Constanza', 'Jarabacoa'],
        'Puerto Plata': ['Puerto Plata', 'Sosúa', 'Cabarete', 'Imbert'],
        'La Altagracia': ['Higüey', 'Punta Cana', 'Bávaro'],
        'La Romana': ['La Romana', 'Bayahíbe'],
        'San Pedro de Macorís': ['San Pedro de Macorís'],
        'Samaná': ['Samaná', 'Las Terrenas', 'Las Galeras'],
    };

    for (const [provinceName, cities] of Object.entries(citiesData)) {
        const provinceId = createdProvincesBySlug[toSlug(provinceName)];
        if (provinceId) {
            for (const cityName of cities) {
                await prisma.city.upsert({
                    where: {
                        provinceId_name: {
                            provinceId,
                            name: cityName,
                        },
                    },
                    update: { slug: toSlug(cityName) },
                    create: { name: cityName, slug: toSlug(cityName), provinceId },
                });
            }
        }
    }
    console.log('[ok] Cities created');

    const sectorsData: Array<{ provinceName: string; cityName: string; sectors: string[] }> = [
        {
            provinceName: 'Distrito Nacional',
            cityName: 'Santo Domingo de Guzmán',
            sectors: ['Piantini', 'Naco', 'Gazcue', 'Zona Colonial', 'Bella Vista'],
        },
        {
            provinceName: 'Santo Domingo',
            cityName: 'Santo Domingo Este',
            sectors: ['Ensanche Ozama', 'Los Mina', 'Alma Rosa', 'Ciudad Juan Bosch'],
        },
        {
            provinceName: 'Santo Domingo',
            cityName: 'Santo Domingo Oeste',
            sectors: ['Herrera', 'Las Caobas', 'Buenos Aires de Herrera'],
        },
        {
            provinceName: 'Santiago',
            cityName: 'Santiago de los Caballeros',
            sectors: ['Los Jardines Metropolitanos', 'Pontezuela', 'Cerros de Gurabo', 'Bella Vista'],
        },
        {
            provinceName: 'La Altagracia',
            cityName: 'Punta Cana',
            sectors: ['Bavaro', 'Veron', 'Cap Cana', 'Cocotal'],
        },
        {
            provinceName: 'Puerto Plata',
            cityName: 'Cabarete',
            sectors: ['El Callejon', 'ProCab', 'Encuentro'],
        },
    ];

    for (const sectorGroup of sectorsData) {
        const provinceId = createdProvincesBySlug[toSlug(sectorGroup.provinceName)];
        if (!provinceId) {
            continue;
        }

        const city = await prisma.city.findUnique({
            where: {
                provinceId_name: {
                    provinceId,
                    name: sectorGroup.cityName,
                },
            },
            select: { id: true },
        });

        if (!city) {
            continue;
        }

        for (const sectorName of sectorGroup.sectors) {
            await prisma.sector.upsert({
                where: {
                    cityId_name: {
                        cityId: city.id,
                        name: sectorName,
                    },
                },
                update: { slug: toSlug(sectorName) },
                create: {
                    cityId: city.id,
                    name: sectorName,
                    slug: toSlug(sectorName),
                },
            });
        }
    }
    console.log(`[ok] ${sectorsData.length} city sector groups created`);

    // Create features
    const features = [
        'WiFi Gratis', 'Estacionamiento', 'Aire Acondicionado', 'Delivery',
        'Para Llevar', 'Reservaciones', 'Accesible', 'Acepta Tarjetas',
        'Terraza', 'Música en Vivo', 'Pet Friendly', 'Área Infantil',
    ];

    await deduplicateFeaturesByName();

    for (const name of features) {
        await prisma.feature.upsert({
            where: { name },
            update: {},
            create: { name },
        });
    }
    console.log(`[ok] ${features.length} features created`);


    await prisma.$executeRaw`
        UPDATE businesses
        SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
    `;
    console.log('[ok] Business locations synced to PostGIS geometry column');

    console.log('\n[ok] Seed completado exitosamente!');
}

main()
    .catch((error: unknown) => {
        console.error('Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
