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
                String(response.data?.message || 'Si el correo existe, enviaremos un enlace para restablecer la contraseña.'),
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar la recuperación de contraseña'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-stage">
            <div className="auth-card">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <h1 className="font-display text-2xl font-bold text-slate-900">Recuperar acceso</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Te enviaremos un enlace para restablecer tu contraseña.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="alert-danger mb-6">
                            {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div className="alert-success mb-6">
                            {successMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="forgot-password-email" className="mb-1 block text-sm font-medium text-slate-700">
                                Correo electrónico
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
                            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-500">
                        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                            Volver a iniciar sesión
                        </Link>
                    </p>
            </div>
        </div>
    );
}
