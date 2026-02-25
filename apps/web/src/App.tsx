import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { AppRouter } from './routes/Router';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <OrganizationProvider>
                    <AppRouter />
                </OrganizationProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
