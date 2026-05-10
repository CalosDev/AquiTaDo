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
        <section className="defer-render-section mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 md:py-10">
            <div className="border-b border-slate-200 pb-5 md:pb-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Como se usa</p>
                        <h2 className="section-title mt-2 !text-2xl md:!text-3xl">Como funciona AquiTa.do</h2>
                        <p className="section-subtitle mt-2 max-w-3xl">
                            Un flujo simple para encontrar opciones locales, revisar senales utiles y llegar al negocio correcto.
                        </p>
                    </div>
                    <p className="text-sm text-slate-500 md:max-w-xs">
                        Pensado para resolver rapido sin abrir varias paginas ni perder contexto.
                    </p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-3 md:gap-4">
                {steps.map((step, index) => (
                    <article key={step.step} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 md:p-5">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-black text-white shadow-sm shadow-primary-900/15">
                                {step.step}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-600">
                                    Paso {index + 1}
                                </p>
                                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{step.title}</h3>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.description}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}
