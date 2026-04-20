import { Link } from 'react-router-dom';
import { ActionBar, AppCard, InfoList, PageIntroCompact, PageShell } from '../components/ui';

export function Terms() {
    const sections = [
        {
            title: 'Uso responsable',
            body: [
                'Al usar AquiTa.do aceptas interactuar con la plataforma de forma legal, respetuosa y honesta.',
                'No puedes usar la plataforma para fraude, suplantacion, spam o practicas que afecten a otros usuarios o negocios.',
            ],
        },
        {
            title: 'Contenido y veracidad',
            body: [
                'Cada usuario es responsable por la informacion que comparte sobre negocios, resenas, contactos y sugerencias.',
                'Podemos moderar, editar o retirar contenido cuando afecte la calidad del catalogo, la seguridad o el cumplimiento de nuestras politicas.',
            ],
        },
        {
            title: 'Operacion del servicio',
            body: [
                'AquiTa.do puede ajustar funciones, flujos y reglas del producto para mejorar la experiencia o cumplir obligaciones legales.',
                'Cuando una cuenta o contenido represente riesgo para la plataforma, podemos limitar acceso o intervenir preventivamente.',
            ],
        },
    ];

    return (
        <PageShell width="narrow" className="animate-fade-in py-10">
            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow="Legal"
                    title="Terminos de uso"
                    description="Estas son las reglas base para usar AquiTa.do de manera clara, respetuosa y alineada con la calidad del catalogo."
                />

                <ActionBar>
                    <Link to="/privacy" className="btn-secondary text-sm">
                        Ver privacidad
                    </Link>
                    <a href="mailto:info@aquita.do" className="btn-primary text-sm">
                        Contactar soporte
                    </a>
                </ActionBar>
            </AppCard>

            {sections.map((section) => (
                <AppCard key={section.title} title={section.title}>
                    <div className="space-y-3 text-sm leading-7 text-slate-600">
                        {section.body.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                    </div>
                </AppCard>
            ))}

            <AppCard
                title="Resumen practico"
                description="Si quieres una version corta, estas son las ideas que mas importan."
            >
                <InfoList
                    items={[
                        {
                            label: 'Respeto',
                            value: 'Usa la plataforma sin enganar ni afectar a otros.',
                        },
                        {
                            label: 'Veracidad',
                            value: 'Comparte solo informacion que puedas sostener.',
                        },
                        {
                            label: 'Moderacion',
                            value: 'Podemos intervenir contenido o cuentas cuando sea necesario para proteger la calidad y la seguridad.',
                        },
                    ]}
                />
            </AppCard>
        </PageShell>
    );
}
