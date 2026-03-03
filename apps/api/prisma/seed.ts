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

async function main() {
    console.log('🌱 Seeding AquiTa.do database...');

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
    console.log('✅ Admin user created:', admin.email);

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
    console.log(`✅ ${plans.length} plans created`);

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
    console.log(`✅ ${categories.length} categories created`);

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
    console.log(`✅ ${dominicanLocalCategories.length} Dominican local categories ensured`);

    // Create provinces
    const provinces = [
        'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional',
        'Duarte', 'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor',
        'Hermanas Mirabal', 'Independencia', 'La Altagracia', 'La Romana',
        'La Vega', 'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi',
        'Monte Plata', 'Pedernales', 'Peravia', 'Puerto Plata',
        'Samaná', 'San Cristóbal', 'San José de Ocoa', 'San Juan',
        'San Pedro de Macorís', 'Sánchez Ramírez', 'Santiago',
        'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
    ];

    const createdProvinces: Record<string, string> = {};

    for (const name of provinces) {
        const slug = name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-');

        const province = await prisma.province.upsert({
            where: { slug },
            update: {},
            create: { name, slug },
        });
        createdProvinces[name] = province.id;
    }
    console.log(`✅ ${provinces.length} provinces created`);

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
        const provinceId = createdProvinces[provinceName];
        if (provinceId) {
            for (const cityName of cities) {
                await prisma.city.upsert({
                    where: {
                        provinceId_name: {
                            provinceId,
                            name: cityName,
                        },
                    },
                    update: {},
                    create: { name: cityName, provinceId },
                });
            }
        }
    }
    console.log('✅ Cities created');

    // Create features
    const features = [
        'WiFi Gratis', 'Estacionamiento', 'Aire Acondicionado', 'Delivery',
        'Para Llevar', 'Reservaciones', 'Accesible', 'Acepta Tarjetas',
        'Terraza', 'Música en Vivo', 'Pet Friendly', 'Área Infantil',
    ];

    for (const name of features) {
        await prisma.feature.upsert({
            where: { name },
            update: {},
            create: { name },
        });
    }
    console.log(`✅ ${features.length} features created`);


    await prisma.$executeRaw`
        UPDATE businesses
        SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
    `;
    console.log('✅ Business locations synced to PostGIS geometry column');

    console.log('\n🎉 Seed completado exitosamente!');
}

main()
    .catch((error: unknown) => {
        console.error('Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
