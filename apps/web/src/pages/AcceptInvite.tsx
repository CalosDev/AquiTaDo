import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { organizationApi } from '../api/endpoints';
import { useOrganization } from '../context/useOrganization';

export function AcceptInvite() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { refreshOrganizations, setActiveOrganizationId } = useOrganization();
    const [processing, setProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        setErrorMessage('');
        setSuccessMessage('');
    }, [token]);

    const handleAcceptInvite = async () => {
        if (!token) {
            setErrorMessage('Token de invitación inválido');
            return;
        }

        setProcessing(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const response = await organizationApi.acceptInvite(token);
            const organizationId = response.data?.organization?.id as string | undefined;

            if (organizationId) {
                await refreshOrganizations(organizationId);
                setActiveOrganizationId(organizationId);
            } else {
                await refreshOrganizations();
            }

            setSuccessMessage('Invitación aceptada correctamente');

            window.setTimeout(() => {
                navigate('/organization');
            }, 900);
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo aceptar la invitación'));
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-16 animate-fade-in">
            <div className="card p-8 text-center">
                <h1 className="font-display text-3xl font-bold text-gray-900 mb-3">Aceptar Invitación</h1>
                <p className="text-gray-500 mb-6">
                    Vincula tu cuenta a la organización para empezar a colaborar.
                </p>

                {errorMessage && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorMessage}
                    </div>
                )}

                {successMessage && (
                    <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        {successMessage}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        className="btn-primary"
                        disabled={processing}
                        onClick={() => void handleAcceptInvite()}
                    >
                        {processing ? 'Procesando...' : 'Aceptar invitación'}
                    </button>
                    <Link to="/organization" className="btn-secondary">
                        Ir a Organización
                    </Link>
                </div>
            </div>
        </div>
    );
}
