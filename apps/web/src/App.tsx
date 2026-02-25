import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './routes/Router';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRouter />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
