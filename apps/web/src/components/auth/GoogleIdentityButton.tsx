import { useEffect, useRef, useState } from 'react';

type GoogleButtonText = 'signin_with' | 'signup_with' | 'continue_with';

type GoogleCredentialResponse = {
    credential?: string;
};

type GoogleButtonRenderOptions = {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    shape?: 'rectangular' | 'pill';
    text?: GoogleButtonText;
    width?: number;
    logo_alignment?: 'left' | 'center';
};

type GoogleIdConfiguration = {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
};

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (configuration: GoogleIdConfiguration) => void;
                    renderButton: (element: HTMLElement, options: GoogleButtonRenderOptions) => void;
                };
            };
        };
    }
}

let googleIdentityScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Google Identity solo esta disponible en navegador'));
    }

    if (window.google?.accounts?.id) {
        return Promise.resolve();
    }

    if (googleIdentityScriptPromise) {
        return googleIdentityScriptPromise;
    }

    googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Google Identity failed to load')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Identity failed to load'));
        document.head.appendChild(script);
    });

    return googleIdentityScriptPromise;
}

interface GoogleIdentityButtonProps {
    clientId: string;
    text: GoogleButtonText;
    disabled?: boolean;
    onCredential: (idToken: string) => void | Promise<void>;
}

export function GoogleIdentityButton({
    clientId,
    text,
    disabled = false,
    onCredential,
}: GoogleIdentityButtonProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const onCredentialRef = useRef(onCredential);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        onCredentialRef.current = onCredential;
    }, [onCredential]);

    useEffect(() => {
        const container = containerRef.current;
        if (!clientId || !container) {
            return;
        }

        let cancelled = false;
        setReady(false);
        setLoadError('');

        void loadGoogleIdentityScript()
            .then(() => {
                if (cancelled || !window.google?.accounts?.id) {
                    return;
                }

                container.innerHTML = '';
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (response) => {
                        const idToken = String(response.credential ?? '').trim();
                        if (!idToken) {
                            return;
                        }

                        void onCredentialRef.current(idToken);
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
                window.google.accounts.id.renderButton(container, {
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text,
                    width: 320,
                    logo_alignment: 'left',
                });
                setReady(true);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                setLoadError(error instanceof Error ? error.message : 'No se pudo cargar Google Identity');
            });

        return () => {
            cancelled = true;
            container.innerHTML = '';
        };
    }, [clientId, text]);

    if (!clientId) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
                {!ready && !loadError && (
                    <div className="h-11 rounded-full border border-gray-200 bg-gray-50 animate-pulse" />
                )}
                <div
                    ref={containerRef}
                    className={ready ? '' : 'sr-only'}
                />
            </div>
            {loadError ? (
                <p className="text-xs text-red-600">{loadError}</p>
            ) : null}
        </div>
    );
}
