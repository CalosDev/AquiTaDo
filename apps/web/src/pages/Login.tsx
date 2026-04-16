import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { AuthPageShell } from '../components/auth/AuthPageShell';
import { GoogleIdentityButton } from '../components/auth/GoogleIdentityButton';
import { FieldHint, InlineNotice, StickyFormActions } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { trackGrowthEvent } from '../lib/growthTracking';
import { useTimedMessage } from '../hooks/useTimedMessage';

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
    const [noticeMessage, setNoticeMessage] = useState(notice);

    useEffect(() => {
        if (!notice) {
            return;
        }

        setNoticeMessage(notice);
        navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true,
            state: null,
        });
    }, [location.hash, location.pathname, location.search, navigate, notice]);

    useTimedMessage(error, setError, 6500);
    useTimedMessage(noticeMessage, setNoticeMessage, 5000);

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
            const message = requestError.response?.data?.message || 'Error al iniciar sesión';
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
        <AuthPageShell
            eyebrow="Acceso"
            title="Entra a tu cuenta"
            description="Accede rápido a discovery, operación SaaS o administración según tu rol, sin ruido visual ni pasos innecesarios."
            asideTitle="Todo el producto, desde el mismo acceso"
            asideBody="El login ya no se siente como una landing. La prioridad es ubicarte rápido en tu área de trabajo y mostrar solo lo esencial."
            asidePoints={[
                'Acceso con correo o Google, según disponibilidad.',
                'Segundo factor solo cuando de verdad aplica.',
                'Recuperación de acceso clara y sin fricción visual.',
            ]}
            footer={(
                <p className="text-center">
                    ¿No tienes cuenta?{' '}
                    <Link to="/register" className="font-semibold text-primary-700 hover:text-primary-800">
                        Crear cuenta
                    </Link>
                </p>
            )}
        >
            <PageFeedbackStack
                items={[
                    { id: 'login-notice', tone: 'success', text: noticeMessage },
                    { id: 'login-error', tone: 'danger', text: error },
                ]}
            />

            {googleClientId ? (
                <div className="space-y-4">
                    <GoogleIdentityButton
                        clientId={googleClientId}
                        text="signin_with"
                        disabled={loading || Boolean(pendingGoogleIdToken)}
                        onCredential={handleGoogleCredential}
                    />
                    <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <span>o usa correo</span>
                        <div className="h-px flex-1 bg-slate-200"></div>
                    </div>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
                {!pendingGoogleIdToken ? (
                    <>
                        <div className="space-y-1.5">
                            <label htmlFor="login-email" className="text-sm font-semibold text-slate-700">
                                Correo electrónico
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

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                                <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">
                                    Contraseña
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                                >
                                    Recuperar acceso
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
                                placeholder="Tu contraseña"
                            />
                        </div>
                    </>
                ) : (
                    <InlineNotice
                        tone="warning"
                        body="Tu cuenta necesita un segundo factor para completar el acceso con Google."
                        action={(
                        <button
                            type="button"
                            className="text-xs font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4"
                            onClick={() => {
                                setPendingGoogleIdToken('');
                                setRequiresTwoFactor(false);
                                setFormData((current) => ({ ...current, twoFactorCode: '' }));
                                setError('');
                            }}
                        >
                            Volver al acceso con correo y contraseña
                        </button>
                        )}
                    />
                )}

                {requiresTwoFactor ? (
                    <div className="space-y-1.5">
                        <label htmlFor="login-2fa" className="text-sm font-semibold text-slate-700">
                            Código 2FA
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
                        <FieldHint>Introduce el código de seis dígitos generado por tu app de autenticación.</FieldHint>
                    </div>
                ) : null}

                <StickyFormActions>
                    <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
                        {loading ? 'Ingresando...' : pendingGoogleIdToken ? 'Confirmar acceso con Google' : 'Iniciar sesión'}
                    </button>
                </StickyFormActions>
            </form>
        </AuthPageShell>
    );
}
