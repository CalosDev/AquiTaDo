import { useEffect } from 'react';
import type { Business, Category, Province } from './types';
import { applySeoMeta, removeJsonLd, upsertJsonLd } from '../../seo/meta';

const ITEM_LIST_LIMIT = 12;

type ActiveIntent = {
    label: string;
    description: string;
} | null;

type UseBusinessesSeoOptions = {
    activeCategory: Category | null;
    activeCategoryDisplayName: string;
    activeIntent: ActiveIntent;
    activeProvince: Province | null;
    businesses: Business[];
    intentSlug?: string;
    seoCanonicalPath: string;
};

export function useBusinessesSeo({
    activeCategory,
    activeCategoryDisplayName,
    activeIntent,
    activeProvince,
    businesses,
    intentSlug,
    seoCanonicalPath,
}: UseBusinessesSeoOptions) {
    useEffect(() => {
        const headingBase = activeIntent
            ? activeIntent.label
            : activeCategory && activeProvince
            ? `${activeCategoryDisplayName} en ${activeProvince.name}`
            : activeCategory
                ? `${activeCategoryDisplayName} en Republica Dominicana`
                : activeProvince
                    ? `Negocios en ${activeProvince.name}`
                    : 'Directorio de negocios en Republica Dominicana';

        const descriptionBase = activeIntent
            ? `${activeIntent.description} Contacta por WhatsApp o teléfono desde AquiTa.do.`
            : activeCategory && activeProvince
            ? `Descubre ${activeCategoryDisplayName.toLowerCase()} en ${activeProvince.name}. Compara opciones locales, contacta por WhatsApp y reserva en AquiTa.do.`
            : activeCategory
                ? `Explora ${activeCategoryDisplayName.toLowerCase()} en Republica Dominicana. Filtra, compara y contacta negocios verificados en AquiTa.do.`
                : activeProvince
                    ? `Encuentra negocios locales en ${activeProvince.name}. Descubre perfiles verificados, reseñas y canales de contacto.`
                    : 'Explora negocios locales en Republica Dominicana. Filtra por categoría y provincia para encontrar opciones verificadas.';

        applySeoMeta({
            title: `${headingBase} | AquiTa.do`,
            description: descriptionBase,
            canonicalPath: seoCanonicalPath,
        });

        const origin = window.location.origin;
        const breadcrumbItems = [
            { name: 'Inicio', url: `${origin}/` },
            { name: 'Negocios', url: `${origin}/businesses` },
        ];

        if (activeProvince) {
            breadcrumbItems.push({
                name: activeProvince.name,
                url: `${origin}/negocios/provincia/${activeProvince.slug}`,
            });
        }

        if (activeIntent && intentSlug) {
            breadcrumbItems.push({
                name: activeIntent.label,
                url: `${origin}/negocios/intencion/${intentSlug}`,
            });
        } else if (activeCategory) {
            breadcrumbItems.push({
                name: activeCategoryDisplayName,
                url: activeProvince
                    ? `${origin}/negocios/${activeProvince.slug}/${activeCategory.slug}`
                    : `${origin}/negocios/categoria/${activeCategory.slug}`,
            });
        }

        upsertJsonLd('businesses-list-breadcrumb', {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbItems.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: item.name,
                item: item.url,
            })),
        });

        if (businesses.length > 0) {
            upsertJsonLd('businesses-list-itemlist', {
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: headingBase,
                itemListElement: businesses.slice(0, ITEM_LIST_LIMIT).map((business, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: business.name,
                    url: `${origin}/businesses/${business.slug || business.id}`,
                })),
            });
        } else {
            removeJsonLd('businesses-list-itemlist');
        }
    }, [activeCategory, activeCategoryDisplayName, activeIntent, activeProvince, businesses, intentSlug, seoCanonicalPath]);

    useEffect(() => {
        return () => {
            removeJsonLd('businesses-list-breadcrumb');
            removeJsonLd('businesses-list-itemlist');
        };
    }, []);
}
