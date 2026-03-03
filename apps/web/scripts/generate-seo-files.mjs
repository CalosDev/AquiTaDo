import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const CATEGORY_SLUGS = [
    'restaurantes',
    'hoteles',
    'tiendas',
    'salud',
    'educacion',
    'tecnologia',
    'belleza',
    'deportes',
    'automotriz',
    'construccion',
    'legal',
    'entretenimiento',
    'supermercados',
    'finanzas',
    'inmobiliaria',
];
const PROVINCE_SLUGS = [
    'azua',
    'bahoruco',
    'barahona',
    'dajabon',
    'distrito-nacional',
    'duarte',
    'el-seibo',
    'elias-pina',
    'espaillat',
    'hato-mayor',
    'hermanas-mirabal',
    'independencia',
    'la-altagracia',
    'la-romana',
    'la-vega',
    'maria-trinidad-sanchez',
    'monsenor-nouel',
    'monte-cristi',
    'monte-plata',
    'pedernales',
    'peravia',
    'puerto-plata',
    'samana',
    'san-cristobal',
    'san-jose-de-ocoa',
    'san-juan',
    'san-pedro-de-macoris',
    'sanchez-ramirez',
    'santiago',
    'santiago-rodriguez',
    'santo-domingo',
    'valverde',
];
const INTENT_SLUGS = [
    'con-delivery',
    'con-parqueo',
    'pet-friendly',
    'con-reservas',
    'accesibles',
];

function normalizeBaseUrl(value) {
    const fallback = 'https://aquitado.vercel.app';
    const raw = (value || '').trim();
    const candidate = raw.length > 0 ? raw : fallback;
    return candidate.replace(/\/+$/, '');
}

function buildSitemap(baseUrl) {
    const nowIso = new Date().toISOString();
    const staticPaths = ['/', '/businesses', '/terms', '/privacy'];
    const categoryPaths = CATEGORY_SLUGS.map((slug) => `/negocios/categoria/${slug}`);
    const provincePaths = PROVINCE_SLUGS.map((slug) => `/negocios/provincia/${slug}`);
    const intentPaths = INTENT_SLUGS.map((slug) => `/negocios/intencion/${slug}`);
    const combinationPaths = PROVINCE_SLUGS.flatMap((provinceSlug) =>
        CATEGORY_SLUGS.map((categorySlug) => `/negocios/${provinceSlug}/${categorySlug}`),
    );

    const allPaths = Array.from(new Set([
        ...staticPaths,
        ...categoryPaths,
        ...provincePaths,
        ...intentPaths,
        ...combinationPaths,
    ]));

    const urls = allPaths.map((path) => {
        let changefreq = 'weekly';
        let priority = '0.7';

        if (path === '/') {
            changefreq = 'daily';
            priority = '1.0';
        } else if (path === '/businesses') {
            changefreq = 'daily';
            priority = '0.9';
        } else if (path === '/terms' || path === '/privacy') {
            changefreq = 'monthly';
            priority = '0.3';
        } else if (path.startsWith('/negocios/categoria/') || path.startsWith('/negocios/provincia/')) {
            changefreq = 'daily';
            priority = '0.85';
        } else if (path.startsWith('/negocios/')) {
            changefreq = 'daily';
            priority = '0.8';
        }

        return {
            loc: `${baseUrl}${path}`,
            changefreq,
            priority,
            lastmod: nowIso,
        };
    });

    const body = urls
        .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildRobots(baseUrl) {
    return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

const baseUrl = normalizeBaseUrl(process.env.VITE_PUBLIC_WEB_URL);
mkdirSync(publicDir, { recursive: true });
writeFileSync(resolve(publicDir, 'robots.txt'), buildRobots(baseUrl), 'utf8');
writeFileSync(resolve(publicDir, 'sitemap.xml'), buildSitemap(baseUrl), 'utf8');
