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
            focus: 'API NestJS, seguridad, multi-tenant y datos',
        },
        {
            name: 'Equipo Frontend',
            role: 'UX & Web Experience',
            focus: 'Experiencia de usuario, conversion y rendimiento web',
        },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
            <section className="card p-7 md:p-10">
                <span className="chip mb-4">Sobre AquiTa.do</span>
                <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900">
                    Un ecosistema local para negocios y clientes en Republica Dominicana
                </h1>
                <p className="mt-4 text-slate-600 max-w-4xl leading-relaxed">
                    AquiTa.do conecta discovery, confianza y conversion en una sola plataforma.
                    Ayudamos a personas a encontrar negocios reales y ayudamos a negocios a
                    gestionar su presencia, recibir contactos y crecer de forma medible.
                </p>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <article className="card p-7">
                    <h2 className="font-display text-2xl font-semibold text-slate-900 mb-3">
                        El proyecto
                    </h2>
                    <p className="text-slate-600 leading-relaxed">
                        Nacimos con una vision clara: construir una plataforma profesional para el
                        mercado dominicano, enfocada en resultados reales para los negocios.
                        Combinamos directorio inteligente, SaaS operativo y canales de conversion
                        (como WhatsApp) para que la plataforma sea util todos los dias.
                    </p>
                    <div className="mt-5 space-y-2 text-sm text-slate-700">
                        <p><strong>Mision:</strong> digitalizar y escalar el comercio local.</p>
                        <p><strong>Enfoque:</strong> performance, confianza y conversion.</p>
                        <p><strong>Mercado inicial:</strong> Republica Dominicana.</p>
                    </div>
                </article>

                <article id="equipo" className="card p-7">
                    <h2 className="font-display text-2xl font-semibold text-slate-900 mb-3">
                        El equipo
                    </h2>
                    <p className="text-slate-600 leading-relaxed">
                        Somos un equipo orientado a producto y ejecucion. Priorizamos calidad,
                        estabilidad y crecimiento sostenible, con un estandar tecnico alineado a
                        plataformas SaaS modernas.
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

