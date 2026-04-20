import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { BusyButtonLabel } from './BusyButtonLabel';
import {
    AppCard,
    FieldHint,
    FormSection,
    InlineNotice,
    StickyFormActions,
} from './ui';
import { useAuth } from '../context/useAuth';
import { useTimedMessage } from '../hooks/useTimedMessage';

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

type ChangePasswordCardProps = {
    title?: string;
    description?: string;
    className?: string;
};

export function ChangePasswordCard({
    title = 'Cambiar contrasena',
    description = 'Actualiza tu clave de acceso. Al guardar, cerraremos tu sesion para que entres otra vez con la nueva contrasena.',
    className = '',
}: ChangePasswordCardProps) {
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage('');

        if (!currentPassword) {
            setErrorMessage('Escribe tu contrasena actual');
            return;
        }

        if (newPassword.length < 8) {
            setErrorMessage('La nueva contrasena debe tener al menos 8 caracteres');
            return;
        }

        if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
            setErrorMessage('La nueva contrasena debe incluir letras y numeros');
            return;
        }

        if (currentPassword === newPassword) {
            setErrorMessage('La nueva contrasena debe ser diferente a la actual');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('La confirmacion de contrasena no coincide');
            return;
        }

        setSaving(true);
        try {
            await authApi.changePassword({
                currentPassword,
                newPassword,
            });
            await logout();
            navigate('/login', {
                replace: true,
                state: {
                    notice: 'Contrasena actualizada. Inicia sesion nuevamente.',
                },
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cambiar la contrasena'));
            setSaving(false);
        }
    };

    return (
        <AppCard title={title} description={description} className={className}>
            {errorMessage ? (
                <InlineNotice
                    tone="danger"
                    title="No pudimos actualizar tu clave"
                    body={errorMessage}
                    className="mb-4"
                />
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit}>
                <input
                    className="sr-only"
                    type="email"
                    name="username"
                    autoComplete="username"
                    value={user?.email ?? ''}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                />

                <FormSection
                    title="Nueva clave"
                    description="Usa una combinacion facil de recordar para ti, pero dificil de adivinar para otros."
                >
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-slate-700">
                                Contrasena actual
                            </label>
                            <input
                                id="current-password"
                                type="password"
                                autoComplete="current-password"
                                className="input-field text-sm"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">
                                Nueva contrasena
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                className="input-field text-sm"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder="Minimo 8 caracteres, con letras y numeros"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
                                Confirmar nueva contrasena
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                className="input-field text-sm"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                            />
                        </div>

                        <FieldHint>
                            Al actualizar tu clave cerraremos la sesion para proteger tu cuenta.
                        </FieldHint>
                    </div>
                </FormSection>

                <StickyFormActions>
                    <button type="submit" className="btn-primary text-sm" disabled={saving}>
                        <BusyButtonLabel
                            busy={saving}
                            busyText="Actualizando..."
                            idleText="Actualizar contrasena"
                        />
                    </button>
                </StickyFormActions>
            </form>
        </AppCard>
    );
}
