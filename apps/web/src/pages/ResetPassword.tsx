import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { trackGrowthEvent } from '../lib/growthTracking';

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
            setErrorMessage('El enlace de recuperacion no es valido.');
            return;
        }

        if (newPassword.length < 8) {
            setErrorMessage('La nueva contrasena debe tener al menos 8 caracteres.');
            return;
        }

        if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
            setErrorMessage('La nueva contrasena debe incluir letras y numeros.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('La confirmacion de contrasena no coincide.');
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
                    notice: 'Contrasena restablecida. Inicia sesion con la nueva clave.',
                },
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo restablecer la contrasena'));
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
                        <h1 className="font-display text-2xl font-bold text-slate-900">Nueva contrasena</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Define una nueva clave para volver a entrar.
                        </p>
                    </div>

                    {!token && (
                        <div className="alert-warning mb-6">
                            El enlace de recuperacion no es valido o esta incompleto.
                        </div>
                    )}

                    {errorMessage && (
                        <div className="alert-danger mb-6">
                            {errorMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="reset-password-new" className="mb-1 block text-sm font-medium text-slate-700">
                                Nueva contrasena
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
                                placeholder="Minimo 8 caracteres, con letras y numeros"
                            />
                        </div>

                        <div>
                            <label htmlFor="reset-password-confirm" className="mb-1 block text-sm font-medium text-slate-700">
                                Confirmar nueva contrasena
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
                                placeholder="Repite tu nueva contrasena"
                            />
                        </div>

                        <button type="submit" disabled={loading || !token} className="btn-primary w-full">
                            {loading ? 'Guardando...' : 'Restablecer contrasena'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-500">
                        <Link to="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
                            Solicitar un nuevo enlace
                        </Link>
                    </p>
            </div>
        </div>
    );
}
