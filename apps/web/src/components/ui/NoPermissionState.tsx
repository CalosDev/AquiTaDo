import type { ReactNode } from 'react';

interface NoPermissionStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
}

/**
 * NoPermissionState — sin acceso (§ 10)
 * Para rutas o módulos donde el usuario no tiene permisos.
 * Debe ser claro y ofrecer una salida.
 */
export function NoPermissionState({
    title = 'Sin acceso',
    body = 'No tienes permisos para ver esta sección.',
    action,
    className = '',
}: NoPermissionStateProps) {
    return (
        <div className={`ux-state-wrap ${className}`} role="alert">
            <div className="ux-state-icon ux-state-icon--no-permission" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                        d="M12 2a5 5 0 0 1 5 5v2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />
                    <path d="M9 11V7a3 3 0 0 1 6 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="1.5" fill="currentColor" />
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
