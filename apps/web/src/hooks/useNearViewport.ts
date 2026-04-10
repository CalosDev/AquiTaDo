import { useEffect, useRef, useState } from 'react';

export function useNearViewport<T extends Element>(
    rootMargin = '280px 0px',
    threshold = 0.01,
    resetKey?: unknown,
) {
    const targetRef = useRef<T | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);

    useEffect(() => {
        setIsNearViewport(false);
    }, [resetKey]);

    useEffect(() => {
        if (isNearViewport) {
            return undefined;
        }

        const element = targetRef.current;
        if (!element) {
            return undefined;
        }

        if (typeof IntersectionObserver === 'undefined') {
            setIsNearViewport(true);
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const nextEntry = entries[0];
                if (!nextEntry) {
                    return;
                }

                if (nextEntry.isIntersecting || nextEntry.intersectionRatio > 0) {
                    setIsNearViewport(true);
                    observer.disconnect();
                }
            },
            {
                rootMargin,
                threshold,
            },
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [isNearViewport, rootMargin, threshold, resetKey]);

    return [targetRef, isNearViewport] as const;
}
