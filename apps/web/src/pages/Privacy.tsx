import { Link } from 'react-router-dom';
import { ActionBar, AppCard, InfoList, PageIntroCompact, PageShell } from '../components/ui';

export function Privacy() {
    const sections = [
        {
            title: 'Que datos usamos',
            body: [
                'Procesamos datos de cuenta, actividad y uso del producto para que puedas iniciar sesion, publicar informacion, guardar negocios y usar funciones operativas.',
                'Tambien podemos usar datos tecnicos basicos para seguridad, diagnostico y mejora del rendimiento del servicio.',
            ],
        },
        {
            title: 'Como los usamos',
            body: [
                'Usamos tu informacion para operar la plataforma, mantener la calidad del catalogo y proteger la seguridad de la experiencia.',
                'No vendemos datos personales. Solo compartimos informacion cuando hace falta para cumplimiento legal, soporte o proteccion de la plataforma.',
            ],
        },
        {
            title: 'Tus opciones',
            body: [
                'Puedes pedir actualizacion o eliminacion de informacion escribiendo a nuestro correo de contacto.',
                'Esta politica puede ajustarse con el tiempo para reflejar cambios del producto o de la normativa aplicable.',
            ],
        },
    ];

    return (
        <PageShell width="narrow" className="animate-fade-in py-10">
            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow="Privacidad"
                    title="Politica de privacidad"
                    description="Aqui tienes un resumen claro de como usamos la informacion necesaria para operar AquiTa.do de forma segura y responsable."
                />

                <ActionBar>
                    <Link to="/terms" className="btn-secondary text-sm">
                        Ver terminos
                    </Link>
                    <a href="mailto:info@aquita.do" className="btn-primary text-sm">
                        Escribir a soporte
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
                title="En corto"
                description="Tres ideas simples para entender nuestra postura."
            >
                <InfoList
                    items={[
                        {
                            label: 'Necesidad',
                            value: 'Usamos datos para que el producto funcione y se mantenga seguro.',
                        },
                        {
                            label: 'Cuidado',
                            value: 'No vendemos tus datos personales.',
                        },
                        {
                            label: 'Control',
                            value: 'Puedes escribirnos para actualizar o solicitar eliminacion de informacion.',
                        },
                    ]}
                />
            </AppCard>
        </PageShell>
    );
}
