import type { ReactNode } from 'react';

interface SuccessStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
    compact?: boolean;
}

/**
 * SuccessState — exito confirmado (§ 10)
 * Para flujos cerrados donde conviene indicar siguiente paso.
 */
export function SuccessState({
    title = 'Accion completada',
    body,
    action,
    className = '',
    compact = false,
}: SuccessStateProps) {
    if (compact) {
        return (
            <div className={`ux-state-wrap ux-state-wrap--compact ${className}`} role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                    <div className="ux-state-icon ux-state-icon--success shrink-0" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <path d="m8.5 12 2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="text-left">
                        <p className="ux-state-title">{title}</p>
                        {body && <p className="ux-state-body max-w-2xl">{body}</p>}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        );
    }

    return (
        <div className={`ux-state-wrap ${className}`} role="status" aria-live="polite">
            <div className="ux-state-icon ux-state-icon--success" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m8.5 12 2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
