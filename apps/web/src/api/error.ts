import axios from 'axios';

interface ApiErrorPayload {
    message?: string | string[];
}

export function isApiTimeoutError(error: unknown): boolean {
    return axios.isAxiosError<ApiErrorPayload>(error)
        && (
            error.code === 'ECONNABORTED'
            || error.message.toLowerCase().includes('timeout')
        );
}

export function getApiErrorMessage(error: unknown, fallback = 'Ocurrio un error inesperado'): string {
    if (axios.isAxiosError<ApiErrorPayload>(error)) {
        if (isApiTimeoutError(error)) {
            return 'La solicitud supero el tiempo de espera. Intenta de nuevo.';
        }

        if (!error.response) {
            return 'No se pudo conectar con el servidor. Verifica la conexion e intenta de nuevo.';
        }

        const payloadMessage = error.response?.data?.message;

        if (Array.isArray(payloadMessage)) {
            const joined = payloadMessage.filter(Boolean).join(', ');
            if (joined) {
                return joined;
            }
        }

        if (typeof payloadMessage === 'string' && payloadMessage.trim().length > 0) {
            return payloadMessage;
        }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return fallback;
}
