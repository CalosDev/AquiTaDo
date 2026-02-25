import { Link } from 'react-router-dom';

export function NotFound() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center animate-fade-in">
            <div className="card p-10">
                <p className="text-6xl mb-4">404</p>
                <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
                    Página no encontrada
                </h1>
                <p className="text-gray-500 mb-6">
                    La ruta que intentas visitar no existe o fue movida.
                </p>
                <Link to="/" className="btn-primary">
                    Volver al inicio
                </Link>
            </div>
        </div>
    );
}
