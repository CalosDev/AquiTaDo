import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { AuthPageShell } from '../components/auth/AuthPageShell';
import { GoogleIdentityButton } from '../components/auth/GoogleIdentityButton';
import { FieldHint, InlineChoiceGroup, InlineNotice, StickyFormActions } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { trackGrowthEvent } from '../lib/growthTracking';
import { useTimedMessage } from '../hooks/useTimedMessage';

const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

const ACCOUNT_TYPE_OPTIONS = [
    {
        value: 'USER' as const,
        title: 'Cuenta cliente',
        description: 'Explora negocios, guarda favoritos, compara listas y reserva.',
        support: 'No crea organización.',
    },
    {
        value: 'BUSINESS_OWNER' as const,
        title: 'Cuenta negocio',
        description: 'Publica y gestiona tu presencia comercial.',
        support: 'La organización aparece al registrar tu primer negocio o aceptar una invitación.',
    },
] as const;

export function Register() {
    const { register, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        accountType: '' as '' | 'USER' | 'BUSINESS_OWNER',
        acceptTerms: false,
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';

    useTimedMessage(error, setError, 6500);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (formData.name.trim().length < 2) {
            setError('El nombre completo es obligatorio');
            return;
        }

        if (!formData.accountType) {
            setError('Selecciona el tipo de cuenta');
            return;
        }

        if (formData.password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        if (!/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password)) {
            setError('La contraseña debe incluir letras y números');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('La confirmación de contraseña no coincide');
            return;
        }

        if (formData.phone.trim() && !PHONE_REGEX.test(formData.phone.trim())) {
            setError('El teléfono no tiene un formato válido');
            return;
        }

        if (!formData.acceptTerms) {
            setError('Debes aceptar los términos y la política de privacidad');
            return;
        }

        setLoading(true);
        try {
            await register(
                formData.name.trim(),
                formData.email.trim(),
                formData.password,
                formData.phone.trim() || undefined,
                formData.accountType,
            );
            navigate('/app');
        } catch (err: unknown) {
            const requestError = err as { response?: { data?: { message?: string } } };
            setError(requestError.response?.data?.message || 'Error al registrarte');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCredential = async (idToken: string) => {
        setError('');

        if (!formData.accountType) {
            setError('Selecciona el tipo de cuenta antes de continuar con Google');
            return;
        }

        if (!formData.acceptTerms) {
            setError('Debes aceptar los términos y la política de privacidad');
            return;
        }

        setLoading(true);
        try {
            await loginWithGoogle(idToken, formData.accountType);
            void trackGrowthEvent({
                eventType: 'GOOGLE_AUTH_SUCCESS',
                metadata: {
                    intent: 'register',
                    surface: 'register',
                    accountType: formData.accountType,
                },
            });
            navigate('/app');
        } catch (err: unknown) {
            const requestError = err as { response?: { data?: { message?: string } } };
            setError(requestError.response?.data?.message || 'No se pudo continuar con Google');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthPageShell
            eyebrow="Registro"
            title="Crea tu cuenta"
            description="Elige claramente si entrarás como cliente o como negocio. La estructura es progresiva, directa y preparada para crecer sin saturarte."
            asideTitle="Un registro que separa intención de superficie"
            asideBody="AquiTa.do distingue discovery, operación SaaS y administración. Por eso el alta define desde el inicio qué tipo de experiencia necesitas."
            asidePoints={[
                'Cuenta cliente para explorar, guardar y reservar.',
                'Cuenta negocio para publicar y operar tu presencia comercial.',
                'Términos claros y onboarding más progresivo.',
            ]}
            footer={(
                <p className="text-center">
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
                        Iniciar sesión
                    </Link>
                </p>
            )}
        >
            <PageFeedbackStack
                items={[
                    { id: 'register-error', tone: 'danger', text: error },
                ]}
            />

            {googleClientId ? (
                <div className="space-y-4">
                    <GoogleIdentityButton
                        clientId={googleClientId}
                        text="signup_with"
                        disabled={loading}
                        onCredential={handleGoogleCredential}
                    />
                    <FieldHint>
                        Selecciona primero el tipo de cuenta y acepta los términos antes de continuar con Google.
                    </FieldHint>
                    <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <span>o completa el formulario</span>
                        <div className="h-px flex-1 bg-slate-200"></div>
                    </div>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                        <label htmlFor="register-name" className="text-sm font-semibold text-slate-700">
                            Nombre completo
                        </label>
                        <input
                            id="register-name"
                            type="text"
                            required
                            autoComplete="name"
                            value={formData.name}
                            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                            className="input-field"
                            placeholder="Juan Pérez"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="register-email" className="text-sm font-semibold text-slate-700">
                            Correo electrónico
                        </label>
                        <input
                            id="register-email"
                            type="email"
                            required
                            autoComplete="email"
                            value={formData.email}
                            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                            className="input-field"
                            placeholder="tu@correo.com"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="register-phone" className="text-sm font-semibold text-slate-700">
                            Teléfono
                        </label>
                        <input
                            id="register-phone"
                            type="tel"
                            autoComplete="tel"
                            value={formData.phone}
                            onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                            className="input-field"
                            placeholder="+1 809-555-0000"
                        />
                    </div>
                </div>

                <InlineChoiceGroup
                    name="accountType"
                    value={formData.accountType}
                    legend="Tipo de cuenta"
                    options={ACCOUNT_TYPE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.title,
                        description: option.description,
                        support: option.support,
                    }))}
                    onChange={(accountType) => setFormData({ ...formData, accountType })}
                    hint={(
                        <InlineNotice
                            body="Las cuentas cliente no crean organización. La organización aparece cuando registras tu primer negocio o aceptas una invitación."
                        />
                    )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label htmlFor="register-password" className="text-sm font-semibold text-slate-700">
                            Contraseña
                        </label>
                        <input
                            id="register-password"
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                            className="input-field"
                            placeholder="Mínimo 8 caracteres"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="register-confirm-password" className="text-sm font-semibold text-slate-700">
                            Confirmar contraseña
                        </label>
                        <input
                            id="register-confirm-password"
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })}
                            className="input-field"
                            placeholder="Repite tu contraseña"
                        />
                    </div>
                </div>

                <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={formData.acceptTerms}
                        onChange={(event) => setFormData({ ...formData, acceptTerms: event.target.checked })}
                        className="mt-1"
                        required
                    />
                    <span>
                        Acepto los{' '}
                        <Link to="/terms" className="font-semibold text-primary-700 hover:text-primary-800">
                            términos
                        </Link>
                        {' '}y la{' '}
                        <Link to="/privacy" className="font-semibold text-primary-700 hover:text-primary-800">
                            política de privacidad
                        </Link>.
                    </span>
                </label>

                <StickyFormActions>
                    <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
                        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                    </button>
                </StickyFormActions>
            </form>
        </AuthPageShell>
    );
}
