import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useAuth } from '../context/useAuth';
import { useTimedMessage } from '../hooks/useTimedMessage';

const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

type ChangePasswordCardProps = {
    title?: string;
    description?: string;
    className?: string;
};

export function ChangePasswordCard({
    title = 'Cambiar contraseña',
    description = 'Actualiza tu contraseña actual y vuelve a iniciar sesión para aplicar el cambio.',
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
            setErrorMessage('Escribe tu contraseña actual');
            return;
        }

        if (newPassword.length < 8) {
            setErrorMessage('La nueva contraseña debe tener al menos 8 caracteres');
            return;
        }

        if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
            setErrorMessage('La nueva contraseña debe incluir letras y números');
            return;
        }

        if (currentPassword === newPassword) {
            setErrorMessage('La nueva contraseña debe ser diferente a la actual');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('La confirmación de contraseña no coincide');
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
                    notice: 'Contraseña actualizada. Inicia sesión nuevamente.',
                },
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cambiar la contraseña'));
            setSaving(false);
        }
    };

    return (
        <div className={['card p-5', className].filter(Boolean).join(' ')}>
            <h2 className="font-display text-lg font-semibold text-gray-900 mb-2">{title}</h2>
            <p className="text-sm text-gray-600 mb-4">{description}</p>

            {errorMessage && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            <form className="space-y-3" onSubmit={handleSubmit}>
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

                <div>
                    <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Contraseña actual
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
                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Nueva contraseña
                    </label>
                    <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        className="input-field text-sm"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Mínimo 8 caracteres, con letras y números"
                    />
                </div>

                <div>
                    <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmar nueva contraseña
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

                <button type="submit" className="btn-primary text-sm" disabled={saving}>
                    {saving ? 'Actualizando...' : 'Actualizar contraseña y cerrar sesión'}
                </button>
            </form>
        </div>
    );
}
