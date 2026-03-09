import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useAuth } from '../context/useAuth';
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
            setSuccessMessage('2FA habilitado. Cierra sesión y vuelve a entrar para aplicar el cambio.');
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
            setSuccessMessage('2FA deshabilitado. Cierra sesión y vuelve a entrar para aplicar el cambio.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo deshabilitar 2FA'));
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        void logout().finally(() => navigate('/login'));
    };

    if (user?.role !== 'ADMIN') {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <div className="card p-6">
                    <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Acceso restringido</h1>
                    <p className="text-sm text-gray-600">
                        Esta sección solo está disponible para administradores de plataforma.
                    </p>
                    <div className="mt-4">
                        <Link to="/" className="btn-secondary text-sm">Volver al inicio</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="mb-6">
                <h1 className="font-display text-3xl font-bold text-gray-900">Seguridad de Administrador</h1>
                <p className="text-sm text-gray-500 mt-1">Gestión de segundo factor (2FA) y acceso reforzado de cuenta admin.</p>
            </div>

            {errorMessage && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="card p-5">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Estado actual</h2>
                        <div className="space-y-2 text-sm text-gray-700">
                            <p>
                                Estado:{' '}
                                <strong className={status?.enabled ? 'text-emerald-700' : 'text-red-700'}>
                                    {status?.enabled ? '2FA activo' : '2FA inactivo'}
                                </strong>
                            </p>
                            {status?.enabledAt && (
                                <p>
                                    Activo desde:{' '}
                                    <strong className="text-gray-900">{formatDateTimeDo(status.enabledAt)}</strong>
                                </p>
                            )}
                            <p>
                                Politica requerida para admins:{' '}
                                <strong className={status?.required ? 'text-emerald-700' : 'text-amber-700'}>
                                    {status?.required ? 'Si' : 'No'}
                                </strong>
                            </p>
                        </div>
                    </div>

                    {!status?.enabled && (
                        <div className="card p-5">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Configurar 2FA</h2>
                            {!setup ? (
                                <button
                                    type="button"
                                    className="btn-primary text-sm"
                                    onClick={() => void handleSetup()}
                                    disabled={saving}
                                >
                                    {saving ? 'Procesando...' : 'Generar QR y secreto'}
                                </button>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                                        <p className="text-sm font-semibold text-primary-900 mb-2">Escanea este QR</p>
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
                                        <p className="mt-1 font-mono text-xs break-all text-primary-900">{setup.secret}</p>
                                        <a
                                            className="inline-block mt-3 text-xs text-primary-700 underline"
                                            href={setup.otpauthUrl}
                                        >
                                            Abrir enlace otpauth
                                        </a>
                                        <div className="mt-4">
                                            <label htmlFor="totp-code-enable" className="block text-xs font-semibold text-gray-700 mb-1">
                                                Codigo de 6 digitos
                                            </label>
                                            <input
                                                id="totp-code-enable"
                                                className="input-field text-sm max-w-[220px]"
                                                inputMode="numeric"
                                                maxLength={6}
                                                placeholder="123456"
                                                value={code}
                                                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-accent text-sm mt-3"
                                            disabled={saving || code.trim().length !== 6}
                                            onClick={() => void handleEnable()}
                                        >
                                            Activar 2FA
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {status?.enabled && (
                        <div className="card p-5">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Deshabilitar 2FA</h2>
                            <p className="text-sm text-gray-600 mb-3">
                                Solo deshabilita 2FA en casos de recuperación. Esta acción reduce seguridad.
                            </p>
                            <label htmlFor="totp-code-disable" className="block text-xs font-semibold text-gray-700 mb-1">
                                Codigo actual de 6 digitos
                            </label>
                            <input
                                id="totp-code-disable"
                                className="input-field text-sm max-w-[220px]"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="123456"
                                value={code}
                                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            />
                            <button
                                type="button"
                                className="btn-secondary text-sm mt-3"
                                disabled={saving || code.trim().length !== 6}
                                onClick={() => void handleDisable()}
                            >
                                Deshabilitar 2FA
                            </button>
                        </div>
                    )}

                    <div className="card p-5">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-2">Aplicar cambios de sesión</h2>
                        <p className="text-sm text-gray-600 mb-3">
                            Para cerrar sesiones anteriores y aplicar políticas de admin, vuelve a iniciar sesión.
                        </p>
                        <button type="button" onClick={handleLogout} className="btn-secondary text-sm">
                            Cerrar sesión ahora
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
