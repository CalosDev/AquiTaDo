import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';

export function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setLoading(true);

        try {
            const response = await authApi.requestPasswordReset({
                email: email.trim(),
            });
            void trackGrowthEvent({
                eventType: 'PASSWORD_RESET_REQUEST',
                metadata: {
                    surface: 'forgot-password',
                },
            });
            setSuccessMessage(
                String(response.data?.message || 'Si el correo existe, enviaremos un enlace para restablecer la contrasena.'),
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar la recuperacion de contrasena'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 animate-fade-in">
            <div className="w-full max-w-md">
                <div className="card p-8">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <h1 className="font-display text-2xl font-bold text-gray-900">Recuperar acceso</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Te enviaremos un enlace para restablecer tu contrasena.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
                            {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl p-3 mb-6">
                            {successMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="forgot-password-email" className="text-sm font-medium text-gray-700 mb-1 block">
                                Correo electronico
                            </label>
                            <input
                                id="forgot-password-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="input-field"
                                placeholder="tu@correo.com"
                            />
                        </div>

                        <button type="submit" disabled={loading} className="btn-primary w-full">
                            {loading ? 'Enviando...' : 'Enviar enlace de recuperacion'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                            Volver a iniciar sesion
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
