import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/error';
import { businessApi, categoryApi } from '../api/endpoints';

interface Business {
    id: string;
    name: string;
    verified: boolean;
    createdAt: string;
    owner?: { name: string };
}

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    _count?: { businesses: number };
}

export function AdminDashboard() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeTab, setActiveTab] = useState<'businesses' | 'categories'>('businesses');
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadData = useCallback(async () => {
        setErrorMessage('');

        try {
            const [bizRes, catRes] = await Promise.all([
                businessApi.getAllAdmin({ limit: 100 }),
                categoryApi.getAll(),
            ]);
            setBusinesses(bizRes.data.data || []);
            setCategories(catRes.data);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el panel admin'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleVerify = async (id: string) => {
        setProcessingId(id);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.verify(id);
            await loadData();
            setSuccessMessage('Negocio aprobado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo aprobar el negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeleteBusiness = async (id: string) => {
        if (!confirm('Seguro que deseas eliminar este negocio?')) {
            return;
        }

        setProcessingId(id);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.delete(id);
            await loadData();
            setSuccessMessage('Negocio eliminado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar el negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const tabs = [
        { key: 'businesses', label: 'Negocios', icon: '🏪' },
        { key: 'categories', label: 'Categorias', icon: '📁' },
    ] as const;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">Panel Admin</h1>
            <p className="text-gray-500 mb-8">Gestion de negocios y categorias</p>

            {errorMessage && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {successMessage}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-primary-600">{businesses.length}</div>
                    <div className="text-xs text-gray-500">Total Negocios</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                        {businesses.filter((b) => b.verified).length}
                    </div>
                    <div className="text-xs text-gray-500">Verificados</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                        {businesses.filter((b) => !b.verified).length}
                    </div>
                    <div className="text-xs text-gray-500">Pendientes</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-accent-600">{categories.length}</div>
                    <div className="text-xs text-gray-500">Categorias</div>
                </div>
            </div>

            <div className="flex gap-2 mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.key
                            ? 'bg-primary-600 text-white shadow-lg'
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-400'
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : (
                <>
                    {activeTab === 'businesses' && (
                        <div className="card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">Negocio</th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">Propietario</th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">Estado</th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">Fecha</th>
                                            <th className="text-right text-xs font-semibold text-gray-500 uppercase p-4">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {businesses.map((biz) => (
                                            <tr key={biz.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-medium text-gray-900">{biz.name}</td>
                                                <td className="p-4 text-sm text-gray-500">{biz.owner?.name || '-'}</td>
                                                <td className="p-4">
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${biz.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                            }`}
                                                    >
                                                        {biz.verified ? 'Verificado' : 'Pendiente'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-gray-400">
                                                    {new Date(biz.createdAt).toLocaleDateString('es-DO')}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {!biz.verified && (
                                                            <button
                                                                onClick={() => handleVerify(biz.id)}
                                                                disabled={processingId === biz.id}
                                                                className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                {processingId === biz.id ? 'Procesando...' : 'Aprobar'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeleteBusiness(biz.id)}
                                                            disabled={processingId === biz.id}
                                                            className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                        >
                                                            {processingId === biz.id ? 'Procesando...' : 'Eliminar'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {businesses.length === 0 && (
                                <div className="p-10 text-center text-gray-400">No hay negocios registrados</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'categories' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Categorias actuales</h3>
                                <div className="flex flex-wrap gap-2">
                                    {categories.map((cat) => (
                                        <div
                                            key={cat.id}
                                            className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm"
                                        >
                                            <span>{cat.icon}</span>
                                            <span className="font-medium">{cat.name}</span>
                                            <span className="text-xs text-gray-400">
                                                ({cat._count?.businesses || 0})
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
