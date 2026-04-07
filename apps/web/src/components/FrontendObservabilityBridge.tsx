import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
    type FrontendObservabilityContext,
    createFrontendObservabilityObservers,
    normalizeFrontendRoute,
    reportRouteView,
    toRoleLabel,
} from '../lib/frontendObservability';

export function FrontendObservabilityBridge() {
    const location = useLocation();
    const { user } = useAuth();
    const latestContext = useRef<FrontendObservabilityContext>({
        pathname: normalizeFrontendRoute(location.pathname),
        role: toRoleLabel(user?.role),
    });

    useEffect(() => {
        latestContext.current = {
            pathname: normalizeFrontendRoute(location.pathname),
            role: toRoleLabel(user?.role),
        };
    }, [location.pathname, user?.role]);

    useEffect(() => {
        const cleanup = createFrontendObservabilityObservers(() => latestContext.current);
        return cleanup;
    }, []);

    useEffect(() => {
        reportRouteView(location.pathname, user?.role);
    }, [location.key, location.pathname, user?.role]);

    return null;
}
