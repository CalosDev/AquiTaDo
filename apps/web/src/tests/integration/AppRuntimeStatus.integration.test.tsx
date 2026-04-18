import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntimeStatus } from '../../components/AppRuntimeStatus';

const runtimeMocks = vi.hoisted(() => ({
    applyPwaUpdate: vi.fn(() => true),
    refetchQueries: vi.fn(async () => undefined),
}));

vi.mock('../../lib/queryClient', () => ({
    queryClient: {
        refetchQueries: runtimeMocks.refetchQueries,
    },
}));

vi.mock('../../lib/pwa', () => ({
    applyPwaUpdate: runtimeMocks.applyPwaUpdate,
}));

describe('AppRuntimeStatus', () => {
    beforeEach(() => {
        runtimeMocks.refetchQueries.mockClear();
        runtimeMocks.applyPwaUpdate.mockClear();
        Object.defineProperty(window.navigator, 'onLine', {
            configurable: true,
            value: true,
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('shows offline and reconnect feedback and refetches active queries', async () => {
        render(<AppRuntimeStatus />);

        fireEvent(window, new Event('offline'));
        expect(screen.getByTestId('runtime-banner-offline')).toBeInTheDocument();

        fireEvent(window, new Event('online'));
        await waitFor(() =>
            expect(runtimeMocks.refetchQueries).toHaveBeenCalledWith({ type: 'active' }),
        );
        expect(screen.getByTestId('runtime-banner-online')).toBeInTheDocument();
    });

    it('lets the user apply a pending PWA update', async () => {
        render(<AppRuntimeStatus />);

        fireEvent(window, new CustomEvent('pwa:update-available'));
        fireEvent.click(
            within(screen.getByTestId('runtime-banner-update'))
                .getByRole('button', { name: /actualizar/i }),
        );

        expect(runtimeMocks.applyPwaUpdate).toHaveBeenCalledTimes(1);
    });
});
