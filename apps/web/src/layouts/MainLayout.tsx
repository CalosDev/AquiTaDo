import { useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { applySeoMeta } from '../seo/meta';

function resolveRouteSeo(pathname: string): { title: string; description: string; noindex?: boolean } {
    if (pathname === '/') {
        return {
            title: 'AquiTa.do | Negocios Locales en Republica Dominicana',
            description: 'Directorio inteligente de negocios locales en Republica Dominicana. Descubre restaurantes, tiendas, servicios y promociones.',
        };
    }

    if (pathname === '/businesses') {
        return {
            title: 'Explorar Negocios | AquiTa.do',
            description: 'Busca negocios por categoria, provincia y nombre. Encuentra opciones verificadas cerca de ti.',
        };
    }

    if (pathname.startsWith('/businesses/')) {
        return {
            title: 'Detalle de Negocio | AquiTa.do',
            description: 'Consulta horarios, contacto, ubicacion y resenas del negocio.',
        };
    }

    if (pathname === '/login') {
        return {
            title: 'Iniciar Sesion | AquiTa.do',
            description: 'Inicia sesion para gestionar tu cuenta, reseñas y operaciones de negocio.',
            noindex: true,
        };
    }

    if (pathname === '/register') {
        return {
            title: 'Crear Cuenta | AquiTa.do',
            description: 'Registra tu cuenta para interactuar con negocios, publicar reseñas y reservar servicios.',
            noindex: true,
        };
    }

    if (pathname === '/register-business') {
        return {
            title: 'Registrar Negocio | AquiTa.do',
            description: 'Registra tu negocio local y aumenta tu visibilidad en Republica Dominicana.',
            noindex: true,
        };
    }

    if (pathname === '/dashboard') {
        return {
            title: 'Dashboard Negocio | AquiTa.do',
            description: 'Panel SaaS para gestionar promociones, reservas, mensajes y analiticas.',
            noindex: true,
        };
    }

    if (pathname === '/admin') {
        return {
            title: 'Panel Admin | AquiTa.do',
            description: 'Administracion interna y operaciones de plataforma.',
            noindex: true,
        };
    }

    if (pathname === '/organization') {
        return {
            title: 'Organizacion | AquiTa.do',
            description: 'Configura miembros, planes y permisos de tu organizacion.',
            noindex: true,
        };
    }

    if (pathname === '/profile') {
        return {
            title: 'Perfil | AquiTa.do',
            description: 'Gestiona tu informacion de usuario y preferencias.',
            noindex: true,
        };
    }

    if (pathname === '/terms') {
        return {
            title: 'Terminos y Condiciones | AquiTa.do',
            description: 'Consulta los terminos y condiciones de uso de AquiTa.do.',
        };
    }

    if (pathname === '/privacy') {
        return {
            title: 'Politica de Privacidad | AquiTa.do',
            description: 'Conoce como AquiTa.do protege y procesa tus datos.',
        };
    }

    if (pathname === '/about') {
        return {
            title: 'Sobre AquiTa.do | Proyecto y Equipo',
            description: 'Conoce la vision del proyecto AquiTa.do y el equipo que construye la plataforma para Republica Dominicana.',
        };
    }

    return {
        title: 'AquiTa.do',
        description: 'Plataforma local de descubrimiento, SaaS y marketplace para negocios en Republica Dominicana.',
    };
}

export function MainLayout() {
    const location = useLocation();
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
            <main className="flex-1 min-h-[calc(100dvh-11rem)]">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
