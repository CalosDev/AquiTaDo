import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { GoogleIdentityButton } from '../components/auth/GoogleIdentityButton';
import { useAuth } from '../context/useAuth';
import { trackGrowthEvent } from '../lib/growthTracking';
import { useTimedMessage } from '../hooks/useTimedMessage';

const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

const ACCOUNT_TYPE_OPTIONS = [
    {
        value: 'USER' as const,
        title: 'Cuenta cliente',
        description: 'Explora negocios, guarda favoritos, compara listas y reserva.',
        support: 'No crea organizacion.',
    },
    {
        value: 'BUSINESS_OWNER' as const,
        title: 'Cuenta negocio',
        description: 'Publica y gestiona tu presencia comercial.',
        support: 'La organizacion aparece al registrar tu primer negocio o aceptar una invitacion.',
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
        <div className="auth-stage flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
            <div className="container-sm w-full max-w-md">
                <div className="card-form">
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-600 text-2xl font-bold text-white shadow-lg shadow-accent-500/30">
                            A
                        </div>
                        <h2 className="font-display text-2xl font-bold text-slate-900">Create your account</h2>
                        <p className="mt-2 text-sm text-slate-500">Join AquiTa.do</p>
                    </div>

                    <PageFeedbackStack
                        items={[
                            { id: 'register-error', tone: 'danger', text: error },
                        ]}
                    />

            {googleClientId && (
                <div className="mb-6 space-y-4">
                    <GoogleIdentityButton
                        clientId={googleClientId}
                        text="signup_with"
                        disabled={loading}
                        onCredential={handleGoogleCredential}
                    />
                    <p className="text-xs text-slate-500">
                        Selecciona primero el tipo de cuenta y acepta los términos para registrarte con Google.
                    </p>
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <span>o</span>
                        <div className="h-px flex-1 bg-slate-200"></div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="register-name" className="mb-1 block text-sm font-medium text-slate-700">
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
                        placeholder="Juan Perez"
                    />
                </div>

                <div>
                    <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-slate-700">
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

                <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-slate-700">
                        Tipo de cuenta
                    </legend>
                    <div className="space-y-3">
                        {ACCOUNT_TYPE_OPTIONS.map((option) => {
                            const selected = formData.accountType === option.value;

                            return (
                                <label
                                    key={option.value}
                                    className={`auth-choice-card ${
                                        selected
                                            ? 'auth-choice-card-selected'
                                            : ''
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="accountType"
                                        value={option.value}
                                        checked={selected}
                                        onChange={() => setFormData({ ...formData, accountType: option.value })}
                                        className="sr-only"
                                    />
                                    <span
                                        aria-hidden="true"
                                        className={`auth-choice-indicator ${
                                            selected
                                                ? 'auth-choice-indicator-selected'
                                                : ''
                                        }`}
                                    >
                                        <span
                                            className={`h-2 w-2 rounded-full bg-white transition-opacity ${
                                                selected ? 'opacity-100' : 'opacity-0'
                                            }`}
                                        />
                                    </span>
                                    <div className="min-w-0 text-left">
                                        <p className="font-semibold text-slate-900">{option.title}</p>
                                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                            {option.description}
                                        </p>
                                        <p className={`mt-2 text-xs font-medium ${
                                            selected ? 'text-primary-700' : 'text-slate-500'
                                        }`}>
                                            {option.support}
                                        </p>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                    <p className="auth-inline-note">
                        Las cuentas cliente no crean organizacion. La organizacion solo aparece en el flujo de negocio
                        cuando registras tu primer negocio o entras a una invitacion.
                    </p>
                </fieldset>

                <div>
                    <label htmlFor="register-phone" className="mb-1 block text-sm font-medium text-slate-700">
                        Teléfono (opcional)
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

                <div>
                    <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-slate-700">
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
                        placeholder="Mínimo 8 caracteres, con letras y números"
                    />
                </div>

                <div>
                    <label htmlFor="register-confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
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

                <label className="flex items-start gap-2 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={formData.acceptTerms}
                        onChange={(event) => setFormData({ ...formData, acceptTerms: event.target.checked })}
                        className="mt-1"
                        required
                    />
                    <span>
                        Acepto los <Link to="/terms" className="text-primary-600 hover:text-primary-700">términos</Link> y la <Link to="/privacy" className="text-primary-600 hover:text-primary-700">política de privacidad</Link>.
                    </span>
                </label>

                    <button type="submit" disabled={loading} className="btn-primary w-full">
                        {loading ? 'Creando cuenta...' : 'Registrarse'}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-500">
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
                        Inicia sesión
                    </Link>
                </p>
            </div>
          </div>
        </div>
    );
}
