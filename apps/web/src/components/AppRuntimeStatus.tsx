import { useEffect, useMemo, useState } from 'react';
import { queryClient } from '../lib/queryClient';
import { applyPwaUpdate } from '../lib/pwa';

const RECOVERY_BANNER_MS = 4_000;

type BannerItem = {
    id: string;
    message: string;
    tone: 'info' | 'success' | 'warning';
    actionLabel?: string;
    onAction?: () => void;
};

export function AppRuntimeStatus() {
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        let recoveryTimeout: number | null = null;

        const handleOffline = () => {
            if (recoveryTimeout) {
                window.clearTimeout(recoveryTimeout);
                recoveryTimeout = null;
            }

            setShowRecoveryNotice(false);
            setIsOnline(false);
        };

        const handleOnline = () => {
            setIsOnline(true);
            setShowRecoveryNotice(true);
            void queryClient.refetchQueries({ type: 'active' }).catch(() => undefined);

            if (recoveryTimeout) {
                window.clearTimeout(recoveryTimeout);
            }

            recoveryTimeout = window.setTimeout(() => {
                setShowRecoveryNotice(false);
            }, RECOVERY_BANNER_MS);
        };

        const handleUpdateAvailable = () => {
            setUpdateAvailable(true);
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        window.addEventListener('pwa:update-available', handleUpdateAvailable);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('pwa:update-available', handleUpdateAvailable);
            if (recoveryTimeout) {
                window.clearTimeout(recoveryTimeout);
            }
        };
    }, []);

    const banners = useMemo<BannerItem[]>(() => {
        const nextBanners: BannerItem[] = [];

        if (!isOnline) {
            nextBanners.push({
                id: 'offline',
                tone: 'warning',
                message: 'Sin conexion. Seguimos mostrando la ultima informacion util y podria estar desactualizada.',
            });
        }

        if (showRecoveryNotice) {
            nextBanners.push({
                id: 'online',
                tone: 'success',
                message: 'Conexion restablecida. Estamos actualizando la informacion visible.',
            });
        }

        if (updateAvailable) {
            nextBanners.push({
                id: 'update',
                tone: 'info',
                message: 'Hay una nueva version disponible. Actualiza para evitar mezclar contenido viejo y nuevo.',
                actionLabel: 'Actualizar',
                onAction: () => {
                    const applied = applyPwaUpdate();
                    if (applied) {
                        setUpdateAvailable(false);
                    }
                },
            });
        }

        return nextBanners;
    }, [isOnline, showRecoveryNotice, updateAvailable]);

    if (banners.length === 0) {
        return null;
    }

    return (
        <div className="app-runtime-status" aria-live="polite" aria-relevant="additions text">
            {banners.map((banner) => (
                <section
                    key={banner.id}
                    className={`app-runtime-status__banner app-runtime-status__banner--${banner.tone}`}
                    role={banner.tone === 'warning' ? 'alert' : 'status'}
                    data-testid={`runtime-banner-${banner.id}`}
                >
                    <p>{banner.message}</p>
                    {banner.actionLabel && banner.onAction ? (
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={banner.onAction}
                        >
                            {banner.actionLabel}
                        </button>
                    ) : null}
                </section>
            ))}
        </div>
    );
}
