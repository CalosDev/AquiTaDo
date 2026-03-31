import type { ContactPlacement } from './types';

interface MobileContactBarProps {
    phone?: string;
    show: boolean;
    whatsapp?: string;
    onOpenWhatsApp: (placement?: ContactPlacement) => Promise<void>;
    onPhoneClick: (placement?: ContactPlacement) => void;
}

export function MobileContactBar({
    phone,
    show,
    whatsapp,
    onOpenWhatsApp,
    onPhoneClick,
}: MobileContactBarProps) {
    if (!show || (!phone && !whatsapp)) {
        return null;
    }

    return (
        <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
            <div className="flex gap-2 rounded-2xl border border-primary-100 bg-white/95 p-2 shadow-xl backdrop-blur">
                {phone ? (
                    <a
                        href={`tel:${phone}`}
                        onClick={() => onPhoneClick('sticky_mobile')}
                        className="flex flex-1 items-center justify-center rounded-xl bg-primary-600 text-sm font-semibold text-white touch-target"
                    >
                        Llamar
                    </a>
                ) : null}
                {whatsapp ? (
                    <button
                        type="button"
                        onClick={() => void onOpenWhatsApp('sticky_mobile')}
                        className="touch-target flex-1 rounded-xl bg-green-600 text-sm font-semibold text-white"
                    >
                        WhatsApp
                    </button>
                ) : null}
            </div>
        </div>
    );
}
