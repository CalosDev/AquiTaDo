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
        <div className="auth-stage">
            <div className="auth-card">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <h1 className="font-display text-2xl font-bold text-slate-900">Bienvenido de vuelta</h1>
                        <p className="mt-1 text-sm text-slate-500">Inicia sesion en tu cuenta</p>
                    </div>

                    {notice && (
                        <div className="alert-success mb-6">
                            {notice}
                        </div>
                    )}

                    {error && (
                        <div className="alert-danger mb-6">
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
                            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                                <div className="h-px flex-1 bg-slate-200"></div>
                                <span>o</span>
                                <div className="h-px flex-1 bg-slate-200"></div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!pendingGoogleIdToken && (
                            <>
                                <div>
                                    <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">
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
                                        <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
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
                            <div className="alert-warning space-y-3">
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
                                <label htmlFor="login-2fa" className="mb-1 block text-sm font-medium text-slate-700">
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

                    <p className="mt-6 text-center text-sm text-slate-500">
                        No tienes cuenta?{' '}
                        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                            Registrate
                        </Link>
                    </p>
            </div>
        </div>
    );
}
