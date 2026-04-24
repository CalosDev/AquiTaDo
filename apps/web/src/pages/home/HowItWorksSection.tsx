type HowItWorksStep = {
    step: string;
    title: string;
    description: string;
};

type HowItWorksSectionProps = {
    steps: readonly HowItWorksStep[];
};

export function HowItWorksSection({ steps }: HowItWorksSectionProps) {
    return (
        <section className="defer-render-section max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-7">
            <div className="section-shell overflow-hidden p-6 md:p-8">
                <div className="flag-ribbon opacity-80"></div>
                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                            <span className="flex items-center gap-1.5" aria-hidden="true">
                                <span className="h-2 w-2 rounded-full bg-primary-900"></span>
                                <span className="h-2 w-2 rounded-full bg-white ring-1 ring-slate-300"></span>
                                <span className="h-2 w-2 rounded-full bg-accent-600"></span>
                            </span>
                            confianza y accion
                        </div>
                        <h2 className="section-title !text-3xl mt-4">Como funciona AquiTa.do</h2>
                        <p className="section-subtitle mt-2 max-w-3xl">
                            Un flujo simple para descubrir mejor, comparar con criterio y llegar al negocio correcto sin vueltas.
                        </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-500 md:max-w-xs">
                        Pensado para decisiones rapidas en RD, no para perderte entre listados planos.
                    </p>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {steps.map((step, index) => (
                        <article key={step.step} className="panel-premium relative p-5">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-accent-600 text-sm font-black text-white shadow-lg shadow-primary-900/20">
                                    {step.step}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-600">
                                        Paso {index + 1}
                                    </p>
                                    <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">{step.title}</h3>
                                </div>
                            </div>
                            <p className="mt-4 text-sm leading-relaxed text-slate-600">{step.description}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
