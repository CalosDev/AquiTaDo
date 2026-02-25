import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { businessApi, uploadApi } from '../api/endpoints';

interface Business {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    createdAt: string;
    _count?: { reviews: number };
    images: { id: string; url: string }[];
}

export function DashboardBusiness() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadBusinesses = useCallback(async () => {
        setErrorMessage('');
        try {
            const res = await businessApi.getMine();
            setBusinesses(res.data || []);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar tus negocios'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadBusinesses();
    }, [loadBusinesses]);

    const handleImageUpload = async (businessId: string, file: File) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setErrorMessage('Formato no valido. Usa JPG, PNG o WEBP');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setErrorMessage('La imagen supera el limite de 5MB');
            return;
        }

        setUploading(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await uploadApi.uploadBusinessImage(businessId, file);
            await loadBusinesses();
            setSuccessMessage('Imagen subida correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo subir la imagen'));
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="font-display text-3xl font-bold text-gray-900">Mi Dashboard</h1>
                    <p className="text-gray-500 mt-1">Administra tus negocios</p>
                </div>
                <Link to="/register-business" className="btn-accent">
                    + Nuevo Negocio
                </Link>
            </div>

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

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="card p-5 text-center">
                    <div className="text-3xl font-bold text-primary-600">{businesses.length}</div>
                    <div className="text-sm text-gray-500">Negocios</div>
                </div>
                <div className="card p-5 text-center">
                    <div className="text-3xl font-bold text-green-600">
                        {businesses.filter((b) => b.verified).length}
                    </div>
                    <div className="text-sm text-gray-500">Verificados</div>
                </div>
                <div className="card p-5 text-center">
                    <div className="text-3xl font-bold text-accent-600">
                        {businesses.reduce((acc, b) => acc + (b._count?.reviews || 0), 0)}
                    </div>
                    <div className="text-sm text-gray-500">Reseñas totales</div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : businesses.length > 0 ? (
                <div className="space-y-4">
                    {businesses.map((biz) => (
                        <div key={biz.id} className="card p-5">
                            <div className="flex items-start justify-between">
                                <div className="flex gap-4">
                                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center flex-shrink-0">
                                        {biz.images?.[0] ? (
                                            <img src={biz.images[0].url} alt="" className="w-full h-full object-cover rounded-xl" />
                                        ) : (
                                            <span className="text-3xl">🏪</span>
                                        )}
                                    </div>
                                    <div>
                                        <Link
                                            to={`/businesses/${biz.id}`}
                                            className="font-display font-semibold text-lg text-gray-900 hover:text-primary-600 transition-colors"
                                        >
                                            {biz.name}
                                        </Link>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${biz.verified
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                    }`}
                                            >
                                                {biz.verified ? '✓ Verificado' : '⏳ Pendiente'}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {biz._count?.reviews || 0} reseñas
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Creado: {new Date(biz.createdAt).toLocaleDateString('es-DO')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <label className="btn-secondary text-xs cursor-pointer">
                                        {uploading === biz.id ? '📤 Subiendo...' : '📷 Subir Foto'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) handleImageUpload(biz.id, e.target.files[0]);
                                            }}
                                            disabled={uploading === biz.id}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Image thumbnails */}
                            {biz.images.length > 0 && (
                                <div className="flex gap-2 mt-4 overflow-x-auto">
                                    {biz.images.map((img) => (
                                        <img
                                            key={img.id}
                                            src={img.url}
                                            alt=""
                                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 text-gray-400">
                    <p className="text-5xl mb-4">📋</p>
                    <p className="text-lg">No tienes negocios registrados</p>
                    <Link to="/register-business" className="btn-primary mt-4 inline-block">
                        Registrar mi Primer Negocio
                    </Link>
                </div>
            )}
        </div>
    );
}
