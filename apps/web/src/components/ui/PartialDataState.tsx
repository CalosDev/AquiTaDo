import type { ReactNode } from 'react';

interface PartialDataStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
    compact?: boolean;
}

/**
 * PartialDataState — datos parciales (§ 10)
 * Para mantener contexto visible cuando parte de la carga falla.
 */
export function PartialDataState({
    title = 'Mostrando datos parciales',
    body = 'Algunos datos no pudieron actualizarse. Conservamos el ultimo contexto util mientras reintentas.',
    action,
    className = '',
    compact = false,
}: PartialDataStateProps) {
    if (compact) {
        return (
            <div className={`ux-state-wrap ux-state-wrap--compact ${className}`} role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                    <div className="ux-state-icon ux-state-icon--partial shrink-0" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
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
            <div className="ux-state-icon ux-state-icon--partial" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
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
