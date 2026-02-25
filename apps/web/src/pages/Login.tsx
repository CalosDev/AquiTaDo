import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(formData.email, formData.password);
            navigate('/');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            setError(error.response?.data?.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 animate-fade-in">
            <div className="w-full max-w-md">
                <div className="card p-8">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl gradient-hero flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-primary-500/30">
                            A
                        </div>
                        <h1 className="font-display text-2xl font-bold text-gray-900">Bienvenido de vuelta</h1>
                        <p className="text-gray-500 text-sm mt-1">Inicia sesión en tu cuenta</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Correo electrónico</label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="input-field"
                                placeholder="tu@correo.com"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Contraseña</label>
                            <input
                                type="password"
                                required
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="input-field"
                                placeholder="••••••••"
                            />
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary w-full">
                            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        ¿No tienes cuenta?{' '}
                        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                            Regístrate
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
