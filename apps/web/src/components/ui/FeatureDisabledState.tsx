import type { ReactNode } from 'react';

interface FeatureDisabledStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
    compact?: boolean;
}

/**
 * FeatureDisabledState — feature apagada o pausada (§ 10)
 * Para dejar claro que la accion existe, pero no esta disponible todavia.
 */
export function FeatureDisabledState({
    title = 'Funcion temporalmente no disponible',
    body = 'Esta accion sigue deshabilitada en la experiencia actual.',
    action,
    className = '',
    compact = false,
}: FeatureDisabledStateProps) {
    if (compact) {
        return (
            <div className={`ux-state-wrap ux-state-wrap--compact ${className}`} role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                    <div className="ux-state-icon ux-state-icon--feature-disabled shrink-0" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
            <div className="ux-state-icon ux-state-icon--feature-disabled" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
