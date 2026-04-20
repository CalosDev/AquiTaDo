import { Link } from 'react-router-dom';
import { AppCard, PageShell } from '../components/ui';

export function NotFound() {
    return (
        <PageShell className="py-20 text-center animate-fade-in" width="narrow">
            <AppCard className="px-10 py-10">
                <p className="mb-4 text-6xl">404</p>
                <h1 className="font-display mb-2 text-3xl font-bold text-slate-900">
                    Pagina no encontrada
                </h1>
                <p className="mb-6 text-slate-600">
                    La ruta que intentas visitar no existe o fue movida.
                </p>
                <Link to="/" className="btn-primary">
                    Volver al inicio
                </Link>
            </AppCard>
        </PageShell>
    );
}
