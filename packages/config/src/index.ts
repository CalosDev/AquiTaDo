// ============================================================
// AquiTa.do — Shared Configuration & Constants
// ============================================================

export const APP_NAME = 'AquiTa.do';
export const APP_DESCRIPTION = 'Directorio inteligente de negocios locales en República Dominicana';

// ---- Roles ----
export const ROLES = {
    USER: 'USER',
    BUSINESS_OWNER: 'BUSINESS_OWNER',
    ADMIN: 'ADMIN',
} as const;

// ---- Pagination Defaults ----
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 12,
    MAX_LIMIT: 100,
} as const;

// ---- Geolocation ----
export const GEO = {
    DEFAULT_RADIUS_KM: 5,
    MAX_RADIUS_KM: 50,
    EARTH_RADIUS_KM: 6371,
} as const;

// ---- Validation ----
export const VALIDATION = {
    PASSWORD_MIN_LENGTH: 8,
    NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 2000,
    PHONE_PATTERN: /^\+?[0-9\s\-()]{7,20}$/,
    SLUG_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    MAX_IMAGES_PER_BUSINESS: 10,
    MAX_IMAGE_SIZE_MB: 5,
    RATING_MIN: 1,
    RATING_MAX: 5,
} as const;

// ---- Dominican Republic Provinces ----
export const PROVINCES = [
    'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional',
    'Duarte', 'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor',
    'Hermanas Mirabal', 'Independencia', 'La Altagracia', 'La Romana',
    'La Vega', 'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi',
    'Monte Plata', 'Pedernales', 'Peravia', 'Puerto Plata',
    'Samaná', 'San Cristóbal', 'San José de Ocoa', 'San Juan',
    'San Pedro de Macorís', 'Sánchez Ramírez', 'Santiago',
    'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
] as const;

// ---- Default Categories ----
export const DEFAULT_CATEGORIES = [
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
] as const;
