import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type AuthStoryPanel = {
    eyebrow: string;
    title: string;
    body: string;
};

type AuthShellProps = {
    title: string;
    subtitle: string;
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    highlights: string[];
    storyPanels?: AuthStoryPanel[];
    heroFooterNote?: string;
    children: ReactNode;
};

const DEFAULT_STORY_PANELS: AuthStoryPanel[] = [
    {
        eyebrow: 'Ruta clara',
        title: 'Menos ruido, mas decision',
        body: 'La entrada a la cuenta debe orientar, no abrumar con modulos o explicaciones duplicadas.',
    },
    {
        eyebrow: 'Mismo sistema',
        title: 'Un lenguaje visual continuo',
        body: 'Acceso, discovery y paneles comparten la misma energia cromatica y la misma jerarquia.',
    },
    {
        eyebrow: 'Confianza',
        title: 'Estados visibles',
        body: 'Errores, ayudas y pasos sensibles aparecen donde el usuario los necesita y con menos friccion.',
    },
    {
        eyebrow: 'Producto real',
        title: 'Pensado para crecer',
        body: 'La base de auth prepara el camino para clientes, negocios, soporte y operacion sin romper el ritmo.',
    },
];

export function AuthShell({
    title,
    subtitle,
    heroEyebrow,
    heroTitle,
    heroDescription,
    highlights,
    storyPanels,
    heroFooterNote,
    children,
}: AuthShellProps) {
    const panels = storyPanels && storyPanels.length > 0 ? storyPanels : DEFAULT_STORY_PANELS;

    return (
        <div className="auth-stage">
            <div className="auth-layout">
                <section className="auth-hero-panel">
                    <div className="auth-hero-top">
                        <div className="auth-hero-badge">
                            Hecho para discovery local en RD
                        </div>

                        <Link to="/" className="auth-brand-lockup">
                            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-white/30 bg-white/90 shadow-lg shadow-black/10">
                                <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-700"></div>
                                <div className="absolute inset-y-0 right-0 w-1/2 bg-accent-600"></div>
                                <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-white">A</span>
                            </div>
                            <div>
                                <p className="font-display text-3xl font-bold">
                                    Aqui<span className="text-accent-300">Ta</span>.do
                                </p>
                                <p className="text-xs uppercase tracking-[0.24em] text-blue-100/80">
                                    Negocios locales en RD
                                </p>
                            </div>
                        </Link>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100/80">
                            {heroEyebrow}
                        </p>
                        <h1 className="font-display text-4xl font-bold leading-tight text-white md:text-5xl">
                            {heroTitle}
                        </h1>
                        <p className="max-w-xl text-base leading-7 text-slate-200">
                            {heroDescription}
                        </p>
                    </div>

                    <div className="auth-feature-list">
                        {highlights.map((highlight) => (
                            <div key={highlight} className="auth-feature-item">
                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/14 text-sm font-bold text-white">
                                    +
                                </span>
                                <span>{highlight}</span>
                            </div>
                        ))}
                    </div>

                    <div className="auth-story-grid">
                        {panels.map((panel) => (
                            <article key={`${panel.eyebrow}-${panel.title}`} className="auth-story-card">
                                <p className="auth-story-eyebrow">{panel.eyebrow}</p>
                                <h3 className="mt-2 font-display text-xl font-semibold text-white">
                                    {panel.title}
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-100/88">
                                    {panel.body}
                                </p>
                            </article>
                        ))}
                    </div>

                    <div className="auth-floating-note">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/75">
                            Plataforma
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-100">
                            {heroFooterNote || 'Una misma cuenta, una misma paleta y una experiencia clara para clientes, negocios y operacion.'}
                        </p>
                    </div>
                </section>

                <section className="auth-card">
                    <div className="auth-card-header">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero text-2xl font-bold text-white shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <div className="space-y-2 text-center">
                            <h2 className="font-display text-2xl font-bold text-slate-900">{title}</h2>
                            <p className="text-sm text-slate-500">{subtitle}</p>
                        </div>
                    </div>

                    {children}
                </section>
            </div>
        </div>
    );
}
