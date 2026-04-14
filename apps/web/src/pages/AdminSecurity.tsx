import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { BusyButtonLabel } from '../components/BusyButtonLabel';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { PageBlockingLoader } from '../components/PageBlockingLoader';
import { useAuth } from '../context/useAuth';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { formatDateTimeDo } from '../lib/market';

interface TwoFactorStatus {
    enabled: boolean;
    pending: boolean;
    required: boolean;
    enabledAt: string | null;
}

interface TwoFactorSetup {
    secret: string;
    otpauthUrl: string;
}

export function AdminSecurity() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [status, setStatus] = useState<TwoFactorStatus | null>(null);
    const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
    const [code, setCode] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 5000);

    const qrUrl = useMemo(() => {
        if (!setup?.otpauthUrl) {
            return null;
        }
        const encoded = encodeURIComponent(setup.otpauthUrl);
        return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encoded}`;
    }, [setup?.otpauthUrl]);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const response = await authApi.getTwoFactorStatus();
            setStatus(response.data as TwoFactorStatus);
        } catch (error) {
            setStatus(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el estado de seguridad'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStatus();
    }, [loadStatus]);

    const handleSetup = async () => {
        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await authApi.setupTwoFactor();
            setSetup(response.data as TwoFactorSetup);
            setSuccessMessage('Escanea el QR con tu app autenticadora y luego confirma con el codigo de 6 digitos.');
            await loadStatus();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar la configuracion 2FA'));
        } finally {
            setSaving(false);
        }
    };

    const handleEnable = async () => {
        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await authApi.enableTwoFactor({ code: code.trim() });
            setCode('');
            setSetup(null);
            await loadStatus();
            setSuccessMessage('2FA habilitado. Cierra sesion y vuelve a entrar para aplicar el cambio.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo habilitar 2FA'));
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async () => {
        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await authApi.disableTwoFactor({ code: code.trim() });
            setCode('');
            setSetup(null);
            await loadStatus();
            setSuccessMessage('2FA deshabilitado. Cierra sesion y vuelve a entrar para aplicar el cambio.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo deshabilitar 2FA'));
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        void logout().finally(() => navigate('/login'));
    };

    const securityBadgeClass = status?.enabled
        ? 'bg-primary-50 text-primary-700'
        : 'bg-accent-50 text-accent-700';
    const policyBadgeClass = status?.required
        ? 'bg-primary-50 text-primary-700'
        : 'bg-amber-50 text-amber-700';
    const nextStepCopy = status?.enabled
        ? 'Mantener codigos de respaldo y cerrar sesiones antiguas'
        : 'Generar QR y activar 2FA antes de abrir accesos';

    if (user?.role !== 'ADMIN') {
        return (
            <div className="page-shell-narrow">
                <div className="section-shell p-6">
                    <h1 className="mb-2 font-display text-2xl font-bold text-gray-900">Acceso restringido</h1>
                    <p className="text-sm text-gray-600">
                        Esta seccion solo esta disponible para administradores de plataforma.
                    </p>
                    <div className="mt-4">
                        <Link to="/" className="btn-secondary text-sm">Volver al inicio</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container-lg py-8 pb-28 space-y-6">
            <section className="role-hero role-hero-admin">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">Seguridad admin</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white">Seguridad de Administrador</h1>
                <p className="mt-2 max-w-2xl text-slate-200">
                    Gestiona segundo factor, endurecimiento de acceso y cambios sensibles de sesion para la cuenta administrativa.
                </p>
                <div className="role-hero-actions">
                    <div className="hero-metric-card w-full max-w-xs">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">Cuenta activa</p>
                        <p className="mt-2 text-sm font-semibold text-white">{user.email ?? 'admin@aquita.do'}</p>
                    </div>
                    <div className="hero-metric-card w-full max-w-xs">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">Politica</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                            {status?.required ? '2FA obligatorio para admin' : '2FA recomendado para admin'}
                        </p>
                    </div>
                    <div className="hero-metric-card w-full max-w-xs">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">Estado actual</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                            {status?.enabled ? 'Cuenta reforzada con 2FA' : 'Cuenta pendiente de reforzar'}
                        </p>
                    </div>
                </div>
            </section>

            {errorMessage && <div className="alert-danger">{errorMessage}</div>}
            {successMessage && <div className="alert-success">{successMessage}</div>}

            {loading ? (
                <PageBlockingLoader
                    label="Preparando controles de seguridad"
                    hint="Cargamos el estado actual de 2FA y las acciones sensibles para evitar cambios en falso."
                    className="py-10"
                />
            ) : (
                <div className="space-y-6">
                    <ChangePasswordCard
                        title="Cambiar contrasena admin"
                        description="Rota tu credencial principal antes de abrir la plataforma al publico. Al guardar, cerraremos tu sesion para obligar un nuevo login."
                    />

                    <div className="section-shell p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-display text-lg font-semibold text-gray-900">Estado actual</h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    Revisa el nivel de endurecimiento antes de administrar accesos o sesiones.
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${securityBadgeClass}`}>
                                {status?.enabled ? '2FA activo' : '2FA pendiente'}
                            </span>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">2FA</p>
                                <p className={`mt-3 text-lg font-semibold ${status?.enabled ? 'text-primary-700' : 'text-accent-700'}`}>
                                    {status?.enabled ? 'Proteccion activa' : 'Proteccion inactiva'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Politica</p>
                                <p className={`mt-3 text-lg font-semibold ${policyBadgeClass.includes('primary') ? 'text-primary-700' : 'text-amber-700'}`}>
                                    {status?.required ? 'Obligatoria' : 'Recomendada'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Activo desde</p>
                                <p className="mt-3 text-sm font-semibold text-gray-900">
                                    {status?.enabledAt ? formatDateTimeDo(status.enabledAt) : 'Aun no configurado'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Siguiente paso</p>
                                <p className="mt-3 text-sm font-semibold text-gray-900">{nextStepCopy}</p>
                            </div>
                        </div>
                    </div>

                    {!status?.enabled && (
                        <div className="section-shell p-5">
                            <h2 className="mb-3 font-display text-lg font-semibold text-gray-900">Configurar 2FA</h2>
                            {!setup ? (
                                <button
                                    type="button"
                                    className="btn-primary text-sm"
                                    onClick={() => void handleSetup()}
                                    disabled={saving}
                                >
                                    <BusyButtonLabel busy={saving} busyText="Procesando..." idleText="Generar QR y secreto" />
                                </button>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <p className="mb-2 text-sm font-semibold text-primary-900">Escanea este QR</p>
                                        {qrUrl ? (
                                            <img
                                                src={qrUrl}
                                                alt="QR de configuracion 2FA"
                                                className="h-52 w-52 rounded-xl border border-primary-200 bg-white p-2"
                                                loading="lazy"
                                            />
                                        ) : null}
                                    </div>
                                    <div className="rounded-2xl border border-primary-100 bg-white p-4">
                                        <p className="text-sm font-semibold text-gray-900">Secreto manual</p>
                                        <p className="mt-1 break-all font-mono text-xs text-primary-900">{setup.secret}</p>
                                        <a
                                            className="mt-3 inline-block text-xs text-primary-700 underline"
                                            href={setup.otpauthUrl}
                                        >
                                            Abrir enlace otpauth
                                        </a>
                                        <div className="mt-4">
                                            <label htmlFor="totp-code-enable" className="mb-1 block text-xs font-semibold text-gray-700">
                                                Codigo de 6 digitos
                                            </label>
                                            <input
                                                id="totp-code-enable"
                                                className="input-field max-w-[220px] text-sm"
                                                inputMode="numeric"
                                                maxLength={6}
                                                placeholder="123456"
                                                value={code}
                                                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-accent mt-3 text-sm"
                                            disabled={saving || code.trim().length !== 6}
                                            onClick={() => void handleEnable()}
                                        >
                                            <BusyButtonLabel busy={saving} busyText="Activando..." idleText="Activar 2FA" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {status?.enabled && (
                        <div className="section-shell p-5">
                            <h2 className="mb-3 font-display text-lg font-semibold text-gray-900">Deshabilitar 2FA</h2>
                            <p className="mb-3 text-sm text-gray-600">
                                Solo deshabilita 2FA en casos de recuperacion. Esta accion reduce seguridad.
                            </p>
                            <label htmlFor="totp-code-disable" className="mb-1 block text-xs font-semibold text-gray-700">
                                Codigo actual de 6 digitos
                            </label>
                            <input
                                id="totp-code-disable"
                                className="input-field max-w-[220px] text-sm"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="123456"
                                value={code}
                                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            />
                            <button
                                type="button"
                                className="btn-secondary mt-3 text-sm"
                                disabled={saving || code.trim().length !== 6}
                                onClick={() => void handleDisable()}
                            >
                                <BusyButtonLabel busy={saving} busyText="Deshabilitando..." idleText="Deshabilitar 2FA" />
                            </button>
                        </div>
                    )}

                    <div className="section-shell p-5">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                            <div>
                                <h2 className="font-display text-lg font-semibold text-gray-900">Aplicar cambios de sesion</h2>
                                <p className="mt-2 text-sm text-gray-600">
                                    Cuando actives o desactives 2FA, vuelve a iniciar sesion para cerrar sesiones antiguas
                                    y asegurar que la politica nueva quede aplicada en todos tus accesos.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <button type="button" onClick={handleLogout} className="btn-secondary text-sm">
                                    Cerrar sesion ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

