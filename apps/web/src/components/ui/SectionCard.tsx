import type { ReactNode } from 'react';

interface SectionCardProps {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    density?: 'cozy' | 'medium' | 'compact';
    as?: 'div' | 'section' | 'article';
}

/**
 * SectionCard — agrupa módulos funcionales (§ 7.1.2)
 *
 * Uso:
 *   <SectionCard title="Reservas" actions={<button>Nueva</button>}>
 *     <ReservationList />
 *   </SectionCard>
 *
 * Regla: título + descripción breve + acciones en header + contenido flexible.
 * No mezclar formularios, listas y métricas dentro del mismo SectionCard.
 */
export function SectionCard({
    title,
    description,
    actions,
    children,
    className = '',
    density = 'medium',
    as: Tag = 'div',
}: SectionCardProps) {
    return (
        <Tag className={`card-section density-${density} ${className}`}>
            <div className="card-section__header">
                <div>
                    <h3 className="card-section__title">{title}</h3>
                    {description && (
                        <p className="card-section__description">{description}</p>
                    )}
                </div>
                {actions && (
                    <div className="flex shrink-0 items-center gap-2">{actions}</div>
                )}
            </div>
            {children}
        </Tag>
    );
}
