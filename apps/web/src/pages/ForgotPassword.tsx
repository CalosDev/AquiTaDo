import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';
import { useTimedMessage } from '../hooks/useTimedMessage';

export function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 5000);

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
        <div className="auth-stage flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
            <div className="container-sm w-full max-w-md">
                <div className="card-form">
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-white shadow-lg shadow-slate-500/30">
                            A
                        </div>
                        <h2 className="font-display text-2xl font-bold text-slate-900">Recuperar acceso</h2>
                        <p className="mt-2 text-sm text-slate-500">Te enviaremos un enlace para volver a entrar</p>
                    </div>
            <PageFeedbackStack
                items={[
                    { id: 'forgot-password-error', tone: 'danger', text: errorMessage },
                    { id: 'forgot-password-success', tone: 'success', text: successMessage },
                ]}
            />

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
                <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
                    Volver a iniciar sesión
                </Link>
            </p>
          </div>
        </div>
      </div>
    );
}
