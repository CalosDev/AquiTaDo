import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { BusyButtonLabel } from '../components/BusyButtonLabel';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { PageBlockingLoader } from '../components/PageBlockingLoader';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import {
    ActionBar,
    AppCard,
    InlineNotice,
    KPIHeader,
    MetricCard,
    NextStepCard,
    PageShell,
    SplitPanelLayout,
} from '../components/ui';
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

    const nextStepCopy = status?.enabled
        ? 'Mantener codigos de respaldo y cerrar sesiones antiguas.'
        : 'Generar QR y activar 2FA antes de abrir accesos.';

    if (user?.role !== 'ADMIN') {
        return (
            <PageShell width="narrow" className="py-10">
                <AppCard
                    title="Acceso restringido"
                    description="Esta seccion solo esta disponible para administradores de plataforma."
                    actions={<Link to="/" className="btn-secondary text-sm">Volver al inicio</Link>}
                >
                    <p className="text-sm leading-6 text-slate-600">
                        Si necesitas revisar configuraciones de seguridad, entra con una cuenta admin autorizada.
                    </p>
                </AppCard>
            </PageShell>
        );
    }

    return (
        <PageShell width="wide" className="space-y-6 py-8 pb-28">
            <PageFeedbackStack
                items={[
                    { id: 'admin-security-error', tone: 'danger', text: errorMessage },
                    { id: 'admin-security-success', tone: 'success', text: successMessage },
                ]}
            />

            <AppCard className="space-y-5">
                <KPIHeader
                    eyebrow="Seguridad admin"
                    title="Seguridad de administrador"
                    description="Gestiona segundo factor, endurecimiento de acceso y cambios sensibles de sesion para la cuenta administrativa."
                    actions={(
                        <ActionBar>
                            <span className="chip">{user.email ?? 'admin@aquita.do'}</span>
                            <Link to="/admin" className="btn-secondary text-sm">
                                Volver al panel
                            </Link>
                        </ActionBar>
                    )}
                    metrics={[
                        {
                            label: 'Politica',
                            value: status?.required ? '2FA obligatorio' : '2FA recomendado',
                            delta: 'Regla actual para cuentas admin',
                        },
                        {
                            label: 'Estado',
                            value: status?.enabled ? 'Cuenta reforzada' : 'Cuenta pendiente',
                            delta: status?.enabled ? 'Proteccion activa' : 'Aun falta activar el segundo factor',
                        },
                        {
                            label: 'Siguiente paso',
                            value: nextStepCopy,
                            delta: 'La idea es mantener el acceso seguro sin mezclarlo con consola tecnica',
                        },
                    ]}
                />
            </AppCard>

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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            label="2FA"
                            value={status?.enabled ? 'Activo' : 'Pendiente'}
                            delta={status?.enabled ? 'Proteccion activa' : 'Proteccion inactiva'}
                        />
                        <MetricCard
                            label="Politica"
                            value={status?.required ? 'Obligatoria' : 'Recomendada'}
                            delta="Regla aplicada a la cuenta"
                        />
                        <MetricCard
                            label="Activo desde"
                            value={status?.enabledAt ? formatDateTimeDo(status.enabledAt) : 'Aun no configurado'}
                            delta="Momento del ultimo endurecimiento"
                        />
                        <MetricCard
                            label="Sesiones"
                            value="Revisar login"
                            delta="Cierra y vuelve a entrar al cambiar esta politica"
                        />
                    </div>

                    {!status?.enabled ? (
                        <AppCard
                            title="Configurar 2FA"
                            description="Genera el QR, valida el codigo y deja la cuenta administrativa mucho mejor protegida."
                            actions={!setup ? (
                                <button
                                    type="button"
                                    className="btn-primary text-sm"
                                    onClick={() => void handleSetup()}
                                    disabled={saving}
                                >
                                    <BusyButtonLabel busy={saving} busyText="Procesando..." idleText="Generar QR y secreto" />
                                </button>
                            ) : undefined}
                        >
                            {!setup ? (
                                <InlineNotice
                                    tone="info"
                                    title="Aun no has generado el segundo factor"
                                    body="Empieza generando el QR y despues confirma con el codigo que te de la app autenticadora."
                                />
                            ) : (
                                <SplitPanelLayout
                                    primary={(
                                        <AppCard title="Escanea el QR" description="Puedes usar Google Authenticator, 1Password o cualquier app TOTP compatible.">
                                            {qrUrl ? (
                                                <img
                                                    src={qrUrl}
                                                    alt="QR de configuracion 2FA"
                                                    className="h-56 w-56 rounded-2xl border border-primary-200 bg-white p-3"
                                                    loading="lazy"
                                                />
                                            ) : null}
                                        </AppCard>
                                    )}
                                    secondary={(
                                        <AppCard title="Confirmar activacion" description="Si prefieres, tambien puedes copiar el secreto manualmente.">
                                            <div className="space-y-4">
                                                <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-4">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Secreto manual</p>
                                                    <p className="mt-2 break-all font-mono text-xs text-primary-900">{setup.secret}</p>
                                                    <a
                                                        className="mt-3 inline-block text-xs font-semibold text-primary-700 underline"
                                                        href={setup.otpauthUrl}
                                                    >
                                                        Abrir enlace otpauth
                                                    </a>
                                                </div>
                                                <div>
                                                    <label htmlFor="totp-code-enable" className="mb-1 block text-sm font-medium text-slate-700">
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
                                                    className="btn-accent text-sm"
                                                    disabled={saving || code.trim().length !== 6}
                                                    onClick={() => void handleEnable()}
                                                >
                                                    <BusyButtonLabel busy={saving} busyText="Activando..." idleText="Activar 2FA" />
                                                </button>
                                            </div>
                                        </AppCard>
                                    )}
                                />
                            )}
                        </AppCard>
                    ) : (
                        <AppCard
                            title="Deshabilitar 2FA"
                            description="Hazlo solo si estas resolviendo una recuperacion real. Desactivar el segundo factor reduce la seguridad de la cuenta."
                        >
                            <InlineNotice
                                tone="warning"
                                title="Accion sensible"
                                body="Antes de deshabilitar 2FA, confirma que no puedes resolver el acceso por otra via mas segura."
                                className="mb-4"
                            />
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="totp-code-disable" className="mb-1 block text-sm font-medium text-slate-700">
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
                                </div>
                                <button
                                    type="button"
                                    className="btn-secondary text-sm"
                                    disabled={saving || code.trim().length !== 6}
                                    onClick={() => void handleDisable()}
                                >
                                    <BusyButtonLabel busy={saving} busyText="Deshabilitando..." idleText="Deshabilitar 2FA" />
                                </button>
                            </div>
                        </AppCard>
                    )}

                    <NextStepCard
                        title="Aplicar cambios de sesion"
                        body="Cuando actives o desactives 2FA, vuelve a iniciar sesion para cerrar sesiones antiguas y asegurar que la politica nueva quede aplicada en todos tus accesos."
                        action={(
                            <button type="button" onClick={handleLogout} className="btn-secondary text-sm">
                                Cerrar sesion ahora
                            </button>
                        )}
                    />
                </div>
            )}
        </PageShell>
    );
}
