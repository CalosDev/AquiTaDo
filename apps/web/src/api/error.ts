import axios from 'axios';

interface ApiErrorPayload {
    message?: string | string[];
}

export function getApiErrorMessage(error: unknown, fallback = 'Ocurrio un error inesperado'): string {
    if (axios.isAxiosError<ApiErrorPayload>(error)) {
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
