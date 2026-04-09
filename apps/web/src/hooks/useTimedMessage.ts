import { useEffect } from 'react';

export function useTimedMessage(
    message: string,
    clearMessage: (nextValue: string) => void,
    delayMs = 4500,
) {
    useEffect(() => {
        if (!message.trim()) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            clearMessage('');
        }, delayMs);

        return () => window.clearTimeout(timeoutId);
    }, [clearMessage, delayMs, message]);
}
