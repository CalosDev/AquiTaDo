interface BusyButtonLabelProps {
    busy: boolean;
    idleText: string;
    busyText: string;
}

export function BusyButtonLabel({ busy, idleText, busyText }: BusyButtonLabelProps) {
    return (
        <span className="inline-flex items-center justify-center gap-2">
            {busy ? (
                <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                />
            ) : null}
            <span>{busy ? busyText : idleText}</span>
        </span>
    );
}
