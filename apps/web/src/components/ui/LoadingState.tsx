interface LoadingStateProps {
    label?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
    sm: 'h-8 w-8 border-[2px]',
    md: 'h-11 w-11 border-[3px]',
    lg: 'h-14 w-14 border-[3px]',
};

/**
 * LoadingState — estado de carga (§ 10)
 * Spinner + label opcional. Sin copy heroico.
 * No reemplaza skeleton loaders en listas largas.
 */
export function LoadingState({ label = 'Cargando...', className = '', size = 'md' }: LoadingStateProps) {
    return (
        <div className={`ux-state-wrap ${className}`} role="status" aria-live="polite">
            <div className="ux-state-icon ux-state-icon--loading">
                <div
                    className={`animate-spin rounded-full border-primary-200 border-r-primary-600 ${sizeMap[size]}`}
                    aria-hidden="true"
                />
            </div>
            <p className="ux-state-title">{label}</p>
        </div>
    );
}
