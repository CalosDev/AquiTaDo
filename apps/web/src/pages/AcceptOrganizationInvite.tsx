import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { organizationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';
import { useTimedMessage } from '../hooks/useTimedMessage';

export function AcceptOrganizationInvite() {
    const { refreshProfile } = useAuth();
    const { refreshOrganizations } = useOrganization();
    const [searchParams] = useSearchParams();
    const initialToken = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);
    const [token, setToken] = useState(initialToken);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [acceptedOrganizationName, setAcceptedOrganizationName] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const acceptInvite = async (inviteToken: string) => {
        setSubmitting(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await organizationApi.acceptInvite(inviteToken.trim());
            const payload = (response.data || {}) as {
                organization?: { id: string; name: string };
                message?: string;
            };
            await refreshProfile();
            await refreshOrganizations(payload.organization?.id || null);
            setAcceptedOrganizationName(payload.organization?.name || '');
            setSuccessMessage(payload.message || 'Invitacion aceptada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo aceptar la invitacion'));
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        if (!initialToken) {
            return;
        }
        void acceptInvite(initialToken);
    }, [initialToken]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!token.trim()) {
            setErrorMessage('Ingresa un token valido');
            return;
        }

        await acceptInvite(token);
    };

    return (
        <div className="page-shell space-y-6 animate-fade-in py-10">
            <PageFeedbackStack
                items={[
                    { id: 'accept-invite-error', tone: 'danger', text: errorMessage },
                    { id: 'accept-invite-success', tone: 'info', text: successMessage },
                ]}
            />

            <section className="role-hero role-hero-owner">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Invitacion de equipo</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white">
                    Acepta acceso a una organizacion
                </h1>
                <p className="mt-2 max-w-2xl text-blue-100">
                    Usa el token que te compartio el owner o manager para unirte al tenant correcto sin depender de soporte manual.
                </p>
            </section>

            <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Token de acceso</p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">Unirse a una organizacion</h2>
                    <p className="mt-2 text-sm text-slate-600">
                        Si abriste un enlace con token, intentaremos aceptarlo automaticamente. Tambien puedes pegarlo manualmente aqui.
                    </p>
                </div>

                <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                    <label className="block text-sm font-medium text-slate-700">
                        Token
                        <textarea
                            className="input-field mt-2 min-h-[120px]"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="Pega aqui el token de invitacion"
                        />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link to="/app" className="btn-secondary text-sm">
                            Volver al app
                        </Link>
                        <button
                            type="submit"
                            className="btn-primary text-sm"
                            disabled={submitting || !token.trim()}
                        >
                            {submitting ? 'Aceptando...' : 'Aceptar invitacion'}
                        </button>
                    </div>
                </form>

                {acceptedOrganizationName ? (
                    <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                        <p className="text-sm font-semibold text-primary-900">Acceso confirmado</p>
                        <p className="mt-1 text-sm text-slate-700">
                            Ya perteneces a <strong>{acceptedOrganizationName}</strong>. Puedes continuar desde tu panel o cambiar de organizacion cuando quieras.
                        </p>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
