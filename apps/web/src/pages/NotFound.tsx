import { Link } from 'react-router-dom';

export function NotFound() {
    return (
        <div className="page-shell-narrow py-20 text-center animate-fade-in">
            <div className="section-shell p-10">
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
            </div>
        </div>
    );
}
