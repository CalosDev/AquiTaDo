type HomeDifferencePoint = {
    title: string;
    description: string;
};

type HomeDifferenceSectionProps = {
    points: readonly HomeDifferencePoint[];
};

export function HomeDifferenceSection({ points }: HomeDifferenceSectionProps) {
    return (
        <section className="defer-render-section mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 md:py-8">
            <div className="section-shell p-5 md:p-7">
                <h2 className="section-title !text-2xl md:!text-3xl">Por que AquiTa.do es diferente</h2>
                <p className="section-subtitle mt-2">
                    No es solo un listado: prioriza contexto local, fichas útiles y señales de confianza.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-3 md:gap-4">
                    {points.map((point) => (
                        <article key={point.title} className="panel-premium p-4 md:p-5">
                            <h3 className="font-display text-lg font-semibold text-slate-900 md:text-xl">{point.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">{point.description}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
