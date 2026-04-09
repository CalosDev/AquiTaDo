interface PageBlockingLoaderProps {
    label: string;
    hint?: string;
    fullScreen?: boolean;
    className?: string;
}

export function PageBlockingLoader({
    label,
    hint = 'Estamos preparando esta vista para que entre estable y sin saltos visuales.',
    fullScreen = false,
    className = '',
}: PageBlockingLoaderProps) {
    return (
        <div
            className={fullScreen ? 'min-h-screen px-4' : className}
        >
            <div className="page-loader-wrap" aria-busy="true" aria-live="polite">
                <section className="page-loader-shell">
                    <span className="page-loader-spinner" aria-hidden="true" />
                    <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary-700">
                        Cargando
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">{label}</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{hint}</p>
                </section>
            </div>
        </div>
    );
}
