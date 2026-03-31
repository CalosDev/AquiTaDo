import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GoogleIdentityButton } from '../components/auth/GoogleIdentityButton';
import { useAuth } from '../context/useAuth';
import { trackGrowthEvent } from '../lib/growthTracking';

export function Login() {
    const { login, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [formData, setFormData] = useState({ email: '', password: '', twoFactorCode: '' });
    const [error, setError] = useState('');
    const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
    const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState('');
    const [loading, setLoading] = useState(false);
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
    const notice =
        typeof location.state === 'object'
        && location.state !== null
        && typeof (location.state as { notice?: unknown }).notice === 'string'
            ? (location.state as { notice: string }).notice
            : '';

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (pendingGoogleIdToken) {
                await loginWithGoogle(
                    pendingGoogleIdToken,
                    undefined,
                    formData.twoFactorCode.trim() || undefined,
                );
                void trackGrowthEvent({
                    eventType: 'GOOGLE_AUTH_SUCCESS',
                    metadata: {
                        intent: 'login',
                        surface: 'login',
                        completedWithTwoFactor: true,
                    },
                });
            } else {
                await login(
                    formData.email,
                    formData.password,
                    formData.twoFactorCode.trim() || undefined,
                );
            }
            navigate('/app');
        } catch (err: unknown) {
            const requestError = err as { response?: { data?: { message?: string } } };
            const message = requestError.response?.data?.message || 'Error al iniciar sesion';
            if (String(message).toLowerCase().includes('2fa')) {
                setRequiresTwoFactor(true);
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCredential = async (idToken: string) => {
        setError('');
        setLoading(true);
        try {
            await loginWithGoogle(idToken);
            void trackGrowthEvent({
                eventType: 'GOOGLE_AUTH_SUCCESS',
                metadata: {
                    intent: 'login',
                    surface: 'login',
                    completedWithTwoFactor: false,
                },
            });
            navigate('/app');
        } catch (err: unknown) {
            const requestError = err as { response?: { data?: { message?: string } } };
            const message = requestError.response?.data?.message || 'No se pudo iniciar con Google';
            if (String(message).toLowerCase().includes('2fa')) {
                setRequiresTwoFactor(true);
                setPendingGoogleIdToken(idToken);
            }
            setError(message);
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
                        <h1 className="font-display text-2xl font-bold text-gray-900">Bienvenido de vuelta</h1>
                        <p className="text-gray-500 text-sm mt-1">Inicia sesion en tu cuenta</p>
                    </div>

                    {notice && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl p-3 mb-6">
                            {notice}
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
                            {error}
                        </div>
                    )}

                    {googleClientId && (
                        <div className="mb-6 space-y-4">
                            <GoogleIdentityButton
                                clientId={googleClientId}
                                text="signin_with"
                                disabled={loading || Boolean(pendingGoogleIdToken)}
                                onCredential={handleGoogleCredential}
                            />
                            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-400">
                                <div className="h-px flex-1 bg-gray-200"></div>
                                <span>o</span>
                                <div className="h-px flex-1 bg-gray-200"></div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!pendingGoogleIdToken && (
                            <>
                                <div>
                                    <label htmlFor="login-email" className="text-sm font-medium text-gray-700 mb-1 block">
                                        Correo electronico
                                    </label>
                                    <input
                                        id="login-email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={formData.email}
                                        onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                                        className="input-field"
                                        placeholder="tu@correo.com"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                        <label htmlFor="login-password" className="text-sm font-medium text-gray-700 block">
                                            Contrasena
                                        </label>
                                        <Link to="/forgot-password" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                                            Olvide mi contrasena
                                        </Link>
                                    </div>
                                    <input
                                        id="login-password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={formData.password}
                                        onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                                        className="input-field"
                                        placeholder="********"
                                    />
                                </div>
                            </>
                        )}
                        {pendingGoogleIdToken && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-3">
                                <p>Tu cuenta requiere un segundo factor. Introduce el codigo 2FA para completar el acceso con Google.</p>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-amber-900 hover:text-amber-950"
                                    onClick={() => {
                                        setPendingGoogleIdToken('');
                                        setRequiresTwoFactor(false);
                                        setFormData((current) => ({ ...current, twoFactorCode: '' }));
                                        setError('');
                                    }}
                                >
                                    Volver al acceso con correo y contrasena
                                </button>
                            </div>
                        )}
                        {requiresTwoFactor && (
                            <div>
                                <label htmlFor="login-2fa" className="text-sm font-medium text-gray-700 mb-1 block">
                                    Codigo 2FA (6 digitos)
                                </label>
                                <input
                                    id="login-2fa"
                                    name="one-time-code"
                                    type="text"
                                    autoComplete="one-time-code"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    required
                                    value={formData.twoFactorCode}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            twoFactorCode: event.target.value.replace(/\D/g, '').slice(0, 6),
                                        })}
                                    className="input-field"
                                    placeholder="123456"
                                />
                            </div>
                        )}
                        <button type="submit" disabled={loading} className="btn-primary w-full">
                            {loading ? 'Ingresando...' : pendingGoogleIdToken ? 'Confirmar acceso con Google' : 'Iniciar sesion'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        No tienes cuenta?{' '}
                        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                            Registrate
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
