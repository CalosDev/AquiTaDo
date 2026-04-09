import type { ReactNode } from 'react';
import { BusyButtonLabel } from './BusyButtonLabel';

interface InlineDangerConfirmProps {
    title: string;
    description: string;
    confirmLabel: string;
    busyLabel: string;
    confirmDisabled?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children?: ReactNode;
    className?: string;
}

export function InlineDangerConfirm({
    title,
    description,
    confirmLabel,
    busyLabel,
    confirmDisabled = false,
    busy = false,
    onConfirm,
    onCancel,
    children,
    className = '',
}: InlineDangerConfirmProps) {
    return (
        <div className={['inline-danger-confirm', className].filter(Boolean).join(' ')}>
            <div className="flex items-start gap-3">
                <div className="inline-danger-confirm-icon" aria-hidden="true">
                    !
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-red-900">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-red-700">{description}</p>
                </div>
            </div>

            {children ? <div className="mt-3 space-y-3">{children}</div> : null}

            <div className="inline-danger-confirm-actions">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={confirmDisabled || busy}
                    className="btn-danger-inline text-xs"
                >
                    <BusyButtonLabel busy={busy} idleText={confirmLabel} busyText={busyLabel} />
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    className="btn-secondary text-xs"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
