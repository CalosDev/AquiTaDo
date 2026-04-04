export function About() {
    const team = [
        {
            name: 'Carlos Manuel',
            role: 'Founder / Product Lead',
            focus: 'Estrategia de producto, roadmap y crecimiento en RD',
        },
        {
            name: 'Equipo Backend',
            role: 'Platform Engineering',
            focus: 'API NestJS, seguridad, discovery y calidad de catálogo',
        },
        {
            name: 'Equipo Frontend',
            role: 'UX & Web Experience',
            focus: 'Experiencia de usuario, exploración y rendimiento web',
        },
    ];

    return (
        <div className="page-shell space-y-10">
            <section className="section-shell p-7 md:p-10">
                <span className="chip mb-4">Conoce AquiTa.do</span>
                <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
                    Una plataforma de discovery local para República Dominicana
                </h1>
                <p className="mt-4 text-slate-600 max-w-4xl leading-relaxed">
                    AquiTa.do conecta discovery, confianza y utilidad pública en una sola plataforma.
                    Ayudamos a personas a encontrar negocios reales con mejor contexto por
                    categoría, ubicación y calidad de ficha.
                </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <article className="section-shell p-7">
                    <h2 className="font-display text-2xl font-semibold text-slate-900 mb-3">
                        El proyecto
                    </h2>
                    <p className="text-slate-600 leading-relaxed">
                        Nacimos con una visión clara: construir una plataforma profesional para el
                        mercado dominicano, enfocada en discovery útil y catálogo confiable.
                        Priorizamos fichas útiles, taxonomía local, geografía real de uso y
                        señales de confianza para que descubrir negocios sea más fácil.
                    </p>
                    <div className="mt-5 space-y-2 text-sm text-slate-700">
                        <p><strong>Misión:</strong> hacer útil el discovery local dominicano.</p>
                        <p><strong>Enfoque:</strong> confianza, calidad de catalogo y relevancia.</p>
                        <p><strong>Mercado inicial:</strong> República Dominicana.</p>
                    </div>
                </article>

                <article id="equipo" className="section-shell p-7">
                    <h2 className="font-display text-2xl font-semibold text-slate-900 mb-3">
                        El equipo
                    </h2>
                    <p className="text-slate-600 leading-relaxed">
                        Somos un equipo orientado a producto y ejecución. Priorizamos calidad,
                        estabilidad y crecimiento sostenible, con un estándar técnico orientado
                        a discovery local y operación de catálogo.
                    </p>
                    <div className="mt-5 space-y-3">
                        {team.map((member) => (
                            <div
                                key={member.role}
                                className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
                            >
                                <p className="font-semibold text-slate-900">{member.name}</p>
                                <p className="text-sm text-primary-700">{member.role}</p>
                                <p className="text-sm text-slate-600 mt-1">{member.focus}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}
