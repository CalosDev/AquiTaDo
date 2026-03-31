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
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 animate-fade-in">
            <div className="w-full max-w-md">
                <div className="card p-8">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <h1 className="font-display text-2xl font-bold text-gray-900">Nueva contrasena</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Define una nueva clave para volver a entrar.
                        </p>
                    </div>

                    {!token && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3 mb-6">
                            El enlace de recuperacion no es valido o esta incompleto.
                        </div>
                    )}

                    {errorMessage && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
                            {errorMessage}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="reset-password-new" className="text-sm font-medium text-gray-700 mb-1 block">
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
                            <label htmlFor="reset-password-confirm" className="text-sm font-medium text-gray-700 mb-1 block">
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

                    <p className="text-center text-sm text-gray-500 mt-6">
                        <Link to="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
                            Solicitar un nuevo enlace
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
