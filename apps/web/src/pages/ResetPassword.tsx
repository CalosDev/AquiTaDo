import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { AuthPageShell } from '../components/auth/AuthPageShell';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';
import { useTimedMessage } from '../hooks/useTimedMessage';

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage('');

        if (!token) {
            setErrorMessage('El enlace de recuperación no es válido.');
            return;
        }

        if (newPassword.length < 8) {
            setErrorMessage('La nueva contraseña debe tener al menos 8 caracteres.');
            return;
        }

        if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
            setErrorMessage('La nueva contraseña debe incluir letras y números.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('La confirmación de contraseña no coincide.');
            return;
        }

        setLoading(true);
        try {
            await authApi.resetPassword({
                token,
                newPassword,
            });
            void trackGrowthEvent({
                eventType: 'PASSWORD_RESET_COMPLETE',
                metadata: {
                    surface: 'reset-password',
                },
            });
            navigate('/login', {
                replace: true,
                state: {
                    notice: 'Contraseña restablecida. Inicia sesión con la nueva clave.',
                },
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo restablecer la contraseña'));
            setLoading(false);
        }
    };

    return (
        <AuthPageShell
            eyebrow="Nueva clave"
            title="Define una contraseña nueva"
            description="Restablece tu acceso con una clave nueva. La pantalla se concentra en validación, seguridad y salida clara."
            asideTitle="Restablecimiento limpio y directo"
            asideBody="Cuando el enlace es válido, la pantalla te deja completar la tarea sin pasos adicionales ni bloques que compitan con el formulario."
            asidePoints={[
                'Validación de token antes de enviar.',
                'Contraseña con reglas mínimas claras.',
                'Retorno directo al login cuando termina.',
            ]}
            footer={(
                <p className="text-center">
                    <Link to="/forgot-password" className="font-semibold text-primary-700 hover:text-primary-800">
                        Solicitar un nuevo enlace
                    </Link>
                </p>
            )}
        >
            <PageFeedbackStack
                items={[
                    {
                        id: 'reset-password-token-warning',
                        tone: 'warning',
                        text: token ? '' : 'El enlace de recuperación no es válido o está incompleto.',
                    },
                    { id: 'reset-password-error', tone: 'danger', text: errorMessage },
                ]}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="reset-password-new" className="text-sm font-semibold text-slate-700">
                        Nueva contraseña
                    </label>
                    <input
                        id="reset-password-new"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="input-field"
                        placeholder="Mínimo 8 caracteres, con letras y números"
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="reset-password-confirm" className="text-sm font-semibold text-slate-700">
                        Confirmar nueva contraseña
                    </label>
                    <input
                        id="reset-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="input-field"
                        placeholder="Repite tu nueva contraseña"
                    />
                </div>

                <button type="submit" disabled={loading || !token} className="btn-primary w-full">
                    {loading ? 'Guardando...' : 'Restablecer contraseña'}
                </button>
            </form>
        </AuthPageShell>
    );
}
