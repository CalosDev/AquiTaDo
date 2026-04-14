import type { ReactNode } from 'react';

interface SummaryCardProps {
    label: string;
    value: ReactNode;
    delta?: ReactNode;
    icon?: ReactNode;
    className?: string;
    density?: 'cozy' | 'medium' | 'compact';
}

/**
 * SummaryCard — métricas y KPIs (§ 7.1.1)
 *
 * Uso:
 *   <SummaryCard label="Reservas hoy" value={12} delta="+3 vs ayer" />
 *
 * Regla: número dominante, label claro, delta/estado opcional.
 * Compacta por defecto en dashboards operativos (density="compact").
 * No usar para filtros, listas ni acciones.
 */
export function SummaryCard({
    label,
    value,
    delta,
    icon,
    className = '',
    density = 'compact',
}: SummaryCardProps) {
    return (
        <div className={`card-summary density-${density} ${className}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="card-summary__label">{label}</p>
                {icon && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 text-sm" aria-hidden="true">
                        {icon}
                    </span>
                )}
            </div>
            <p className="card-summary__value">{value}</p>
            {delta && <p className="card-summary__delta">{delta}</p>}
        </div>
    );
}
