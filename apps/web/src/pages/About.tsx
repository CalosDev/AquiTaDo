import { Link } from 'react-router-dom';
import {
    ActionBar,
    AppCard,
    DashboardContentLayout,
    InfoList,
    MetricCard,
    PageIntroCompact,
    PageShell,
} from '../components/ui';

export function About() {
    const team = [
        {
            name: 'Carlos Manuel',
            role: 'Founder / Product Lead',
            focus: 'Direccion de producto, roadmap y crecimiento inicial en Republica Dominicana',
        },
        {
            name: 'Equipo Backend',
            role: 'Platform Engineering',
            focus: 'API, calidad de catalogo, discovery y reglas de confianza',
        },
        {
            name: 'Equipo Frontend',
            role: 'UX & Web Experience',
            focus: 'Experiencia de usuario, claridad visual y rendimiento en web',
        },
    ];

    const principles = [
        {
            label: 'Lo que queremos resolver',
            value: 'Hacer mas util encontrar negocios reales con contexto confiable',
            hint: 'No buscamos solo listar lugares, sino ayudar a decidir mejor.',
        },
        {
            label: 'Como lo hacemos',
            value: 'Discovery local, datos utiles y calidad sostenida de ficha',
            hint: 'Priorizamos contexto, ubicacion y señales de confianza.',
        },
        {
            label: 'Donde empezamos',
            value: 'Republica Dominicana',
            hint: 'Construimos el producto con sensibilidad local, no como una copia generica.',
        },
    ];

    return (
        <PageShell width="wide" className="animate-fade-in py-10">
            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow="Conoce AquiTa.do"
                    title="Discovery local pensado para Republica Dominicana"
                    description="AquiTa.do une discovery, confianza y utilidad publica en una misma experiencia para que descubrir negocios se sienta mas claro y menos improvisado."
                />

                <ActionBar>
                    <Link to="/businesses" className="btn-primary text-sm">
                        Explorar catalogo
                    </Link>
                    <Link to="/suggest-business" className="btn-secondary text-sm">
                        Sugerir un negocio
                    </Link>
                </ActionBar>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <MetricCard
                        label="Promesa"
                        value="Discovery util"
                        delta="Ayudar a decidir con mejor contexto"
                    />
                    <MetricCard
                        label="Enfoque"
                        value="Confianza"
                        delta="Fichas mas claras, relevantes y legibles"
                    />
                    <MetricCard
                        label="Mercado inicial"
                        value="RD"
                        delta="Construido alrededor del uso local"
                    />
                </div>
            </AppCard>

            <DashboardContentLayout
                primary={(
                    <AppCard
                        title="Que estamos construyendo"
                        description="Una plataforma que ayude a encontrar negocios reales con mejor contexto por categoria, ubicacion y calidad de informacion."
                    >
                        <div className="space-y-4 text-sm leading-7 text-slate-600">
                            <p>
                                AquiTa.do nace con una idea sencilla: descubrir negocios locales deberia sentirse
                                mas claro, mas confiable y mas util para la vida diaria.
                            </p>
                            <p>
                                En vez de inflar la experiencia con ruido, apostamos por catalogo bien curado,
                                geografia real de uso y fichas que ayuden a entender rapido que ofrece cada lugar.
                            </p>
                            <p>
                                Queremos que explorar, comparar y volver a un negocio interesante se sienta natural,
                                tanto para usuarios como para los equipos que luego lo gestionan.
                            </p>
                        </div>
                    </AppCard>
                )}
                secondary={(
                    <AppCard
                        title="Nuestros principios"
                        description="Tres ideas que guian el producto desde el principio."
                    >
                        <InfoList items={principles} />
                    </AppCard>
                )}
            />

            <AppCard
                title="El equipo"
                description="Somos un equipo enfocado en producto, ejecucion y crecimiento sostenible."
            >
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {team.map((member) => (
                        <div
                            key={member.role}
                            className="rounded-[24px] border border-slate-200/80 bg-white px-5 py-5 shadow-sm shadow-slate-900/5"
                        >
                            <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                            <p className="mt-1 text-sm font-medium text-primary-700">{member.role}</p>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{member.focus}</p>
                        </div>
                    ))}
                </div>
            </AppCard>
        </PageShell>
    );
}
