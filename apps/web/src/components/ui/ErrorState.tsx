import type { ReactNode } from 'react';

interface ErrorStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
}

/**
 * ErrorState — estado de error (§ 10)
 * Mensaje claro y acción de recuperación.
 * No improvisar mensajes de error por pantalla.
 */
export function ErrorState({
    title = 'Ocurrió un error',
    body = 'No pudimos cargar esta información. Intenta de nuevo.',
    action,
    className = '',
}: ErrorStateProps) {
    return (
        <div className={`ux-state-wrap ${className}`} role="alert">
            <div className="ux-state-icon ux-state-icon--error" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
                <p className="ux-state-title">{title}</p>
                {body && <p className="ux-state-body">{body}</p>}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
