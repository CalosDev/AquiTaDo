import { useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { applySeoMeta } from '../seo/meta';

const FOOTER_HIDDEN_PREFIXES = [
    '/app',
    '/profile',
    '/register-business',
    '/dashboard',
    '/admin',
    '/security',
];

function resolveRouteSeo(pathname: string): { title: string; description: string; noindex?: boolean } {
    if (pathname === '/') {
        return {
            title: 'AquiTa.do | Negocios Locales en República Dominicana',
            description: 'Discovery local de negocios en República Dominicana. Explora categorías, ubicaciones y perfiles útiles para decidir.',
        };
    }

    if (pathname === '/businesses') {
        return {
            title: 'Explorar Negocios | AquiTa.do',
            description: 'Busca negocios por categoría, provincia, ciudad y nombre. Encuentra opciones verificadas cerca de ti.',
        };
    }

    if (pathname.startsWith('/businesses/')) {
        return {
            title: 'Detalle de Negocio | AquiTa.do',
            description: 'Consulta contacto, ubicación, reputación y datos clave del negocio.',
        };
    }

    if (pathname === '/login') {
        return {
            title: 'Iniciar Sesión | AquiTa.do',
            description: 'Inicia sesión para gestionar tu cuenta, reseñas y operaciones de negocio.',
            noindex: true,
        };
    }

    if (pathname === '/register') {
        return {
            title: 'Crear Cuenta | AquiTa.do',
            description: 'Registra tu cuenta para guardar favoritos, publicar reseñas y seguir negocios locales.',
            noindex: true,
        };
    }

    if (pathname === '/register-business') {
        return {
            title: 'Registrar Negocio | AquiTa.do',
            description: 'Registra tu negocio local y aumenta tu visibilidad en República Dominicana.',
            noindex: true,
        };
    }

    if (pathname === '/dashboard') {
        return {
            title: 'Dashboard Negocio | AquiTa.do',
            description: 'Panel del negocio para mantener su ficha pública y visibilidad local.',
            noindex: true,
        };
    }

    if (pathname === '/admin') {
        return {
            title: 'Panel Admin | AquiTa.do',
            description: 'Administración interna y operaciones de plataforma.',
            noindex: true,
        };
    }

    if (pathname === '/profile') {
        return {
            title: 'Perfil | AquiTa.do',
            description: 'Gestiona tu información de usuario y preferencias.',
            noindex: true,
        };
    }

    if (pathname === '/terms') {
        return {
            title: 'Términos y Condiciones | AquiTa.do',
            description: 'Consulta los términos y condiciones de uso de AquiTa.do.',
        };
    }

    if (pathname === '/privacy') {
        return {
            title: 'Política de Privacidad | AquiTa.do',
            description: 'Conoce cómo AquiTa.do protege y procesa tus datos.',
        };
    }

    if (pathname === '/about') {
        return {
            title: 'Sobre AquiTa.do | Proyecto y Equipo',
            description: 'Conoce la visión del proyecto AquiTa.do y el equipo que construye la plataforma para República Dominicana.',
        };
    }

    return {
        title: 'AquiTa.do',
        description: 'Plataforma local de discovery de negocios en República Dominicana.',
    };
}

export function MainLayout() {
    const location = useLocation();
    const showFooter = useMemo(
        () => !FOOTER_HIDDEN_PREFIXES.some(
            (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
        ),
        [location.pathname],
    );
    const routeSeo = useMemo(
        () => resolveRouteSeo(location.pathname),
        [location.pathname],
    );

    useEffect(() => {
        applySeoMeta({
            title: routeSeo.title,
            description: routeSeo.description,
            canonicalPath: location.pathname,
            noindex: routeSeo.noindex,
        });
    }, [location.pathname, routeSeo.description, routeSeo.noindex, routeSeo.title]);

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
                <Outlet />
            </main>
            {showFooter && <Footer />}
        </div>
    );
}
