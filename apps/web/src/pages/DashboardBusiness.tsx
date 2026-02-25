import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { businessApi, uploadApi } from '../api/endpoints';

interface BusinessImage {
    id: string;
    url: string;
}

interface Business {
    id: string;
    name: string;
    description: string;
    address: string;
    phone?: string;
    whatsapp?: string;
    verified: boolean;
    createdAt: string;
    _count?: { reviews: number };
    images: BusinessImage[];
}

type EditBusinessForm = {
    name: string;
    description: string;
    address: string;
    phone: string;
    whatsapp: string;
};

const EMPTY_EDIT_FORM: EditBusinessForm = {
    name: '',
    description: '',
    address: '',
    phone: '',
    whatsapp: '',
};

export function DashboardBusiness() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadingBusinessId, setUploadingBusinessId] = useState<string | null>(null);
    const [savingBusinessId, setSavingBusinessId] = useState<string | null>(null);
    const [deletingBusinessId, setDeletingBusinessId] = useState<string | null>(null);
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
    const [editingBusinessId, setEditingBusinessId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<EditBusinessForm>(EMPTY_EDIT_FORM);
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
            setErrorMessage('Formato no válido. Usa JPG, PNG o WEBP');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setErrorMessage('La imagen supera el límite de 5MB');
            return;
        }

        setUploadingBusinessId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await uploadApi.uploadBusinessImage(businessId, file);
            await loadBusinesses();
            setSuccessMessage('Imagen subida correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo subir la imagen'));
        } finally {
            setUploadingBusinessId(null);
        }
    };

    const handleDeleteImage = async (imageId: string) => {
        setDeletingImageId(imageId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await uploadApi.deleteBusinessImage(imageId);
            await loadBusinesses();
            setSuccessMessage('Imagen eliminada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la imagen'));
        } finally {
            setDeletingImageId(null);
        }
    };

    const startEditBusiness = (business: Business) => {
        setEditingBusinessId(business.id);
        setEditForm({
            name: business.name,
            description: business.description,
            address: business.address,
            phone: business.phone || '',
            whatsapp: business.whatsapp || '',
        });
        setErrorMessage('');
        setSuccessMessage('');
    };

    const cancelEditBusiness = () => {
        setEditingBusinessId(null);
        setEditForm(EMPTY_EDIT_FORM);
    };

    const saveBusinessChanges = async (businessId: string) => {
        if (!editForm.name.trim() || !editForm.description.trim() || !editForm.address.trim()) {
            setErrorMessage('Nombre, descripción y dirección son obligatorios');
            return;
        }

        setSavingBusinessId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await businessApi.update(businessId, {
                name: editForm.name.trim(),
                description: editForm.description.trim(),
                address: editForm.address.trim(),
                phone: editForm.phone.trim() || undefined,
                whatsapp: editForm.whatsapp.trim() || undefined,
            });
            await loadBusinesses();
            setSuccessMessage('Negocio actualizado correctamente');
            cancelEditBusiness();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el negocio'));
        } finally {
            setSavingBusinessId(null);
        }
    };

    const deleteBusiness = async (businessId: string) => {
        if (!window.confirm('Seguro que deseas eliminar este negocio?')) {
            return;
        }

        setDeletingBusinessId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await businessApi.delete(businessId);
            await loadBusinesses();
            setSuccessMessage('Negocio eliminado correctamente');
            if (editingBusinessId === businessId) {
                cancelEditBusiness();
            }
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar el negocio'));
        } finally {
            setDeletingBusinessId(null);
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
                    {businesses.map((business) => (
                        <div key={business.id} className="card p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4 flex-1">
                                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center flex-shrink-0">
                                        {business.images?.[0] ? (
                                            <img
                                                src={business.images[0].url}
                                                alt=""
                                                className="w-full h-full object-cover rounded-xl"
                                            />
                                        ) : (
                                            <span className="text-3xl">🏪</span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <Link
                                            to={`/businesses/${business.id}`}
                                            className="font-display font-semibold text-lg text-gray-900 hover:text-primary-600 transition-colors"
                                        >
                                            {business.name}
                                        </Link>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                    business.verified
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}
                                            >
                                                {business.verified ? '✓ Verificado' : '⏳ Pendiente'}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {business._count?.reviews || 0} reseñas
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Creado: {new Date(business.createdAt).toLocaleDateString('es-DO')}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2 flex-wrap justify-end">
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() =>
                                            editingBusinessId === business.id
                                                ? cancelEditBusiness()
                                                : startEditBusiness(business)
                                        }
                                    >
                                        {editingBusinessId === business.id ? 'Cancelar' : 'Editar'}
                                    </button>
                                    <label className="btn-secondary text-xs cursor-pointer">
                                        {uploadingBusinessId === business.id ? '📤 Subiendo...' : '📷 Subir Foto'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    void handleImageUpload(business.id, e.target.files[0]);
                                                }
                                            }}
                                            disabled={uploadingBusinessId === business.id}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                        onClick={() => void deleteBusiness(business.id)}
                                        disabled={deletingBusinessId === business.id}
                                    >
                                        {deletingBusinessId === business.id ? 'Eliminando...' : 'Eliminar'}
                                    </button>
                                </div>
                            </div>

                            {editingBusinessId === business.id && (
                                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                                            Nombre
                                        </label>
                                        <input
                                            type="text"
                                            className="input-field text-sm"
                                            value={editForm.name}
                                            onChange={(event) =>
                                                setEditForm((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                                            Descripción
                                        </label>
                                        <textarea
                                            className="input-field text-sm"
                                            rows={3}
                                            value={editForm.description}
                                            onChange={(event) =>
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    description: event.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                                            Dirección
                                        </label>
                                        <input
                                            type="text"
                                            className="input-field text-sm"
                                            value={editForm.address}
                                            onChange={(event) =>
                                                setEditForm((prev) => ({ ...prev, address: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">
                                                Teléfono
                                            </label>
                                            <input
                                                type="text"
                                                className="input-field text-sm"
                                                value={editForm.phone}
                                                onChange={(event) =>
                                                    setEditForm((prev) => ({
                                                        ...prev,
                                                        phone: event.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">
                                                WhatsApp
                                            </label>
                                            <input
                                                type="text"
                                                className="input-field text-sm"
                                                value={editForm.whatsapp}
                                                onChange={(event) =>
                                                    setEditForm((prev) => ({
                                                        ...prev,
                                                        whatsapp: event.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            onClick={cancelEditBusiness}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-primary text-xs"
                                            onClick={() => void saveBusinessChanges(business.id)}
                                            disabled={savingBusinessId === business.id}
                                        >
                                            {savingBusinessId === business.id ? 'Guardando...' : 'Guardar cambios'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {business.images.length > 0 && (
                                <div className="flex gap-2 mt-4 overflow-x-auto">
                                    {business.images.map((image) => (
                                        <div key={image.id} className="relative w-16 h-16 flex-shrink-0">
                                            <img
                                                src={image.url}
                                                alt=""
                                                className="w-full h-full rounded-lg object-cover"
                                            />
                                            <button
                                                type="button"
                                                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center disabled:opacity-50"
                                                onClick={() => void handleDeleteImage(image.id)}
                                                disabled={deletingImageId === image.id}
                                                title="Eliminar imagen"
                                            >
                                                ×
                                            </button>
                                        </div>
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
