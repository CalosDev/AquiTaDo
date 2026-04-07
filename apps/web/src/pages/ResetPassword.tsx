import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';
import { AuthShell } from '../components/auth/AuthShell';

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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
        <AuthShell
            title="Nueva contraseña"
            subtitle="Define una clave nueva para volver a entrar"
            heroEyebrow="Paso final"
            heroTitle="Cierra la recuperación con un flujo más claro."
            heroDescription="La última parte del acceso ahora mantiene mejor jerarquía visual, mensajes más limpios y una composición menos improvisada."
            highlights={[
                'Validación clara de la nueva clave',
                'Estados visibles sin ruido innecesario',
                'Continuidad con el resto del sistema de acceso',
                'Footer más ligero en pantallas auth',
            ]}
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
                <div>
                    <label htmlFor="reset-password-new" className="mb-1 block text-sm font-medium text-slate-700">
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

                <div>
                    <label htmlFor="reset-password-confirm" className="mb-1 block text-sm font-medium text-slate-700">
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

            <p className="mt-6 text-center text-sm text-slate-500">
                <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">
                    Solicitar un nuevo enlace
                </Link>
            </p>
        </AuthShell>
    );
}
