import type { ReactNode } from 'react';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    body?: string;
    action?: ReactNode;
    className?: string;
}

/**
 * EmptyState — estado sin datos (§ 10, § 7.1.6)
 * Usar cuando un módulo no tiene ítems que mostrar.
 * Mensaje simple + acción sugerida. Sin decoración excesiva.
 */
export function EmptyState({ icon, title, body, action, className = '' }: EmptyStateProps) {
    return (
        <div className={`ux-state-wrap ${className}`} role="status">
            {icon && (
                <div className="ux-state-icon ux-state-icon--empty" aria-hidden="true">
                    {icon}
                </div>
            )}
            <div className="flex flex-col items-center gap-1">
                <p className="ux-state-title">{title}</p>
                {body && <p className="ux-state-body">{body}</p>}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
