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

    console.log('\n🎉 Seed completado exitosamente!');
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
