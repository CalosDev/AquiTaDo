import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { AuthPageShell } from '../components/auth/AuthPageShell';
import { FieldHint, StickyFormActions } from '../components/ui';
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
        <AuthPageShell
            eyebrow="Recuperación"
            title="Recupera tu acceso"
            description="Entra tu correo y te enviaremos el siguiente paso sin mezclar la tarea con mensajes innecesarios."
            asideTitle="Un flujo corto para una tarea sensible"
            asideBody="Estas pantallas se mantuvieron simples a propósito: una decisión, un formulario y una salida clara."
            asidePoints={[
                'Una sola acción principal por pantalla.',
                'Estados de éxito y error bien visibles.',
                'Regreso directo al acceso cuando termine el flujo.',
            ]}
            footer={(
                <p className="text-center">
                    <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
                        Volver a iniciar sesión
                    </Link>
                </p>
            )}
        >
            <PageFeedbackStack
                items={[
                    { id: 'forgot-password-error', tone: 'danger', text: errorMessage },
                    { id: 'forgot-password-success', tone: 'success', text: successMessage },
                ]}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="forgot-password-email" className="text-sm font-semibold text-slate-700">
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
                    <FieldHint>Usa el correo con el que entras normalmente a AquiTa.do.</FieldHint>
                </div>

                <StickyFormActions>
                    <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
                        {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                    </button>
                </StickyFormActions>
            </form>
        </AuthPageShell>
    );
}
