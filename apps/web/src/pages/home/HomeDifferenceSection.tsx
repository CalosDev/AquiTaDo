type HomeDifferencePoint = {
    title: string;
    description: string;
};

type HomeDifferenceSectionProps = {
    points: readonly HomeDifferencePoint[];
};

export function HomeDifferenceSection({ points }: HomeDifferenceSectionProps) {
    return (
        <section className="defer-render-section max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-7">
            <div className="section-shell p-6 md:p-8">
                <h2 className="section-title !text-3xl">Por que AquiTa.do es diferente</h2>
                <p className="section-subtitle mt-2">
                    No es solo un listado: prioriza contexto local, fichas útiles y señales de confianza.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {points.map((point) => (
                        <article key={point.title} className="panel-premium p-5">
                            <h3 className="font-display text-xl font-semibold text-slate-900">{point.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">{point.description}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
