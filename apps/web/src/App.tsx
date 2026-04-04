import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { AppRouter } from './routes/Router';
import { queryClient } from './lib/queryClient';

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <OrganizationProvider>
                        <AppRouter />
                    </OrganizationProvider>
                </AuthProvider>
            </BrowserRouter>
            <SpeedInsights />
        </QueryClientProvider>
    );
}

export default App;
