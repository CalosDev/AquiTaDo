import type { Page, Route } from '@playwright/test';

const HOME_CATEGORIES = [
    { id: 'cat-colmados', name: 'Colmados', slug: 'colmados', _count: { businesses: 24 } },
    { id: 'cat-restaurantes', name: 'Restaurantes', slug: 'restaurantes', _count: { businesses: 18 } },
    { id: 'cat-farmacias', name: 'Farmacias', slug: 'farmacias', _count: { businesses: 12 } },
    { id: 'cat-salones', name: 'Salones', slug: 'salones-barberias', _count: { businesses: 10 } },
    { id: 'cat-ferreterias', name: 'Ferreterias', slug: 'ferreterias', _count: { businesses: 32 } },
    { id: 'cat-tecnologia', name: 'Tecnologia', slug: 'tecnologia', _count: { businesses: 8 } },
    { id: 'cat-tiendas', name: 'Tiendas', slug: 'tiendas', _count: { businesses: 6 } },
    { id: 'cat-automotriz', name: 'Automotriz', slug: 'automotriz', _count: { businesses: 4 } },
];

const HOME_PROVINCES = [
    { id: 'prov-azua', name: 'Azua', slug: 'azua', _count: { businesses: 12 } },
    { id: 'prov-bahoruco', name: 'Bahoruco', slug: 'bahoruco', _count: { businesses: 10 } },
    { id: 'prov-barahona', name: 'Barahona', slug: 'barahona', _count: { businesses: 9 } },
    { id: 'prov-dajabon', name: 'Dajabon', slug: 'dajabon', _count: { businesses: 8 } },
    { id: 'prov-distrito', name: 'Distrito Nacional', slug: 'distrito-nacional', _count: { businesses: 7 } },
    { id: 'prov-duarte', name: 'Duarte', slug: 'duarte', _count: { businesses: 6 } },
    { id: 'prov-elias', name: 'Elías Piña', slug: 'elias-pina', _count: { businesses: 5 } },
    { id: 'prov-seibo', name: 'El Seibo', slug: 'el-seibo', _count: { businesses: 4 } },
    { id: 'prov-espaillat', name: 'Espaillat', slug: 'espaillat', _count: { businesses: 3 } },
    { id: 'prov-hato-mayor', name: 'Hato Mayor', slug: 'hato-mayor', _count: { businesses: 2 } },
];

function json(route: Route, body: unknown) {
    return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(body),
    });
}

export async function mockHomeVisualApi(page: Page): Promise<void> {
    await page.route('**/api/categories', async (route) => {
        await json(route, HOME_CATEGORIES);
    });

    await page.route('**/api/provinces', async (route) => {
        await json(route, HOME_PROVINCES);
    });

    await page.route('**/api/businesses?*', async (route) => {
        await json(route, {
            data: [],
            total: 0,
            page: 1,
            limit: 6,
            totalPages: 0,
        });
    });

    await page.route('**/api/reputation/rankings?*', async (route) => {
        await json(route, []);
    });
}
