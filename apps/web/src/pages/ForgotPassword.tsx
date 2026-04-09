import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';
import { AuthShell } from '../components/auth/AuthShell';
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
        <AuthShell
            title="Recuperar acceso"
            subtitle="Te enviaremos un enlace para volver a entrar"
            heroEyebrow="Recuperación segura"
            heroTitle="Recupera tu cuenta sin perder el hilo."
            heroDescription="El flujo de recuperación ahora acompaña mejor al usuario y mantiene la misma dirección visual que el resto de la plataforma."
            highlights={[
                'Enlace de recuperación con mensaje claro',
                'Estados de error y éxito más consistentes',
                'Menos ruido visual en una tarea sensible',
                'Continuidad visual con login y registro',
            ]}
        >
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
        </AuthShell>
    );
}
