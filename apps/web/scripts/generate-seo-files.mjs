import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');

function normalizeBaseUrl(value) {
    const fallback = 'https://aquitado.vercel.app';
    const raw = (value || '').trim();
    const candidate = raw.length > 0 ? raw : fallback;
    return candidate.replace(/\/+$/, '');
}

function buildSitemap(baseUrl) {
    const urls = [
        { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.0' },
        { loc: `${baseUrl}/businesses`, changefreq: 'hourly', priority: '0.9' },
        { loc: `${baseUrl}/terms`, changefreq: 'monthly', priority: '0.3' },
        { loc: `${baseUrl}/privacy`, changefreq: 'monthly', priority: '0.3' },
    ];

    const body = urls
        .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`)
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
