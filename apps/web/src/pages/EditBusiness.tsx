import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { businessApi, categoryApi, featuresApi, locationApi, uploadApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { OptimizedImage } from '../components/OptimizedImage';

interface Category {
    id: string;
    name: string;
    icon?: string;
}

interface Feature {
    id: string;
    name: string;
}

interface Province {
    id: string;
    name: string;
}

interface City {
    id: string;
    name: string;
}

interface BusinessDetail {
    id: string;
    slug: string;
    name: string;
    description: string;
    phone?: string | null;
    whatsapp?: string | null;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    province?: { id: string; name: string } | null;
    city?: { id: string; name: string } | null;
    categories?: Array<{ category: { id: string; name: string; icon?: string } }>;
    features?: Array<{ feature: { id: string; name: string } }>;
    images?: Array<{ id: string; url: string }>;
}

interface EditFormData {
    name: string;
    description: string;
    phone: string;
    whatsapp: string;
    address: string;
    provinceId: string;
    cityId: string;
    latitude: string;
    longitude: string;
    categoryIds: string[];
    featureIds: string[];
}

const EMPTY_FORM: EditFormData = {
    name: '',
    description: '',
    phone: '',
    whatsapp: '',
    address: '',
    provinceId: '',
    cityId: '',
    latitude: '',
    longitude: '',
    categoryIds: [],
    featureIds: [],
};

export function EditBusiness() {
    const { businessId } = useParams<{ businessId: string }>();

    const [business, setBusiness] = useState<BusinessDetail | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [features, setFeatures] = useState<Feature[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [formData, setFormData] = useState<EditFormData>(EMPTY_FORM);
    const [initialProvinceId, setInitialProvinceId] = useState('');
    const [selectedImages, setSelectedImages] = useState<File[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const selectedCategorySet = useMemo(
        () => new Set(formData.categoryIds),
        [formData.categoryIds],
    );
    const selectedFeatureSet = useMemo(
        () => new Set(formData.featureIds),
        [formData.featureIds],
    );

    const loadCities = useCallback(async (provinceId: string) => {
        if (!provinceId) {
            setCities([]);
            return;
        }
        try {
            const response = await locationApi.getCities(provinceId);
            setCities((response.data || []) as City[]);
        } catch {
            setCities([]);
        }
    }, []);

    const loadData = useCallback(async () => {
        if (!businessId) {
            setErrorMessage('Negocio no encontrado');
            setLoading(false);
            return;
        }

        setLoading(true);
        setErrorMessage('');

        try {
            const [businessResponse, categoriesResponse, featuresResponse, provincesResponse] = await Promise.all([
                businessApi.getById(businessId),
                categoryApi.getAll(),
                featuresApi.getAll(),
                locationApi.getProvinces(),
            ]);

            const payload = (businessResponse.data || null) as BusinessDetail | null;
            if (!payload) {
                setBusiness(null);
                setErrorMessage('No se pudo cargar el negocio');
                setLoading(false);
                return;
            }

            const nextForm: EditFormData = {
                name: payload.name || '',
                description: payload.description || '',
                phone: payload.phone || '',
                whatsapp: payload.whatsapp || '',
                address: payload.address || '',
                provinceId: payload.province?.id || '',
                cityId: payload.city?.id || '',
                latitude: typeof payload.latitude === 'number' ? String(payload.latitude) : '',
                longitude: typeof payload.longitude === 'number' ? String(payload.longitude) : '',
                categoryIds: (payload.categories || []).map((entry) => entry.category.id),
                featureIds: (payload.features || []).map((entry) => entry.feature.id),
            };

            setBusiness(payload);
            setCategories((categoriesResponse.data || []) as Category[]);
            setFeatures((featuresResponse.data || []) as Feature[]);
            setProvinces((provincesResponse.data || []) as Province[]);
            setFormData(nextForm);
            setInitialProvinceId(nextForm.provinceId);

            if (nextForm.provinceId) {
                await loadCities(nextForm.provinceId);
            } else {
                setCities([]);
            }
        } catch (error) {
            setBusiness(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la edicion del negocio'));
        } finally {
            setLoading(false);
        }
    }, [businessId, loadCities]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!formData.provinceId) {
            setCities([]);
            return;
        }
        void loadCities(formData.provinceId);
    }, [formData.provinceId, loadCities]);

    const toggleCategory = (categoryId: string) => {
        setFormData((previous) => {
            const exists = previous.categoryIds.includes(categoryId);
            return {
                ...previous,
                categoryIds: exists
                    ? previous.categoryIds.filter((id) => id !== categoryId)
                    : [...previous.categoryIds, categoryId],
            };
        });
    };

    const toggleFeature = (featureId: string) => {
        setFormData((previous) => {
            const exists = previous.featureIds.includes(featureId);
            return {
                ...previous,
                featureIds: exists
                    ? previous.featureIds.filter((id) => id !== featureId)
                    : [...previous.featureIds, featureId],
            };
        });
    };

    const handleSelectImages = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) {
            setSelectedImages([]);
            return;
        }

        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const maxBytes = 5 * 1024 * 1024;
        const nextImages: File[] = [];

        for (const file of files.slice(0, 5)) {
            if (!allowedMimeTypes.has(file.type)) {
                continue;
            }
            if (file.size > maxBytes) {
                continue;
            }
            nextImages.push(file);
        }

        setSelectedImages(nextImages);
        event.target.value = '';
    };

    const handleDeleteImage = async (imageId: string) => {
        setDeletingImageId(imageId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await uploadApi.deleteBusinessImage(imageId);
            setBusiness((previous) => {
                if (!previous) {
                    return previous;
                }
                return {
                    ...previous,
                    images: (previous.images || []).filter((image) => image.id !== imageId),
                };
            });
            setSuccessMessage('Imagen eliminada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la imagen'));
        } finally {
            setDeletingImageId(null);
        }
    };

    const validateForm = (): string | null => {
        if (formData.name.trim().length < 3) {
            return 'El nombre debe tener al menos 3 caracteres';
        }
        if (formData.description.trim().length < 20) {
            return 'La descripcion debe tener al menos 20 caracteres';
        }
        if (!formData.address.trim()) {
            return 'La direccion es obligatoria';
        }
        if (!formData.provinceId) {
            return 'Debes seleccionar una provincia';
        }
        if (formData.categoryIds.length === 0) {
            return 'Debes seleccionar al menos una categoria';
        }
        if (formData.provinceId !== initialProvinceId && !formData.cityId) {
            return 'Si cambias la provincia, selecciona una ciudad para completar la actualizacion';
        }
        if (formData.latitude.trim()) {
            const latitude = Number.parseFloat(formData.latitude);
            if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
                return 'La latitud no es valida';
            }
        }
        if (formData.longitude.trim()) {
            const longitude = Number.parseFloat(formData.longitude);
            if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
                return 'La longitud no es valida';
            }
        }
        return null;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!businessId) {
            setErrorMessage('Negocio no encontrado');
            return;
        }

        const validationError = validateForm();
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const payload: Record<string, unknown> = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                address: formData.address.trim(),
                provinceId: formData.provinceId,
                categoryIds: formData.categoryIds,
                featureIds: formData.featureIds,
            };

            if (formData.phone.trim()) {
                payload.phone = formData.phone.trim();
            }
            if (formData.whatsapp.trim()) {
                payload.whatsapp = formData.whatsapp.trim();
            }
            if (formData.cityId) {
                payload.cityId = formData.cityId;
            }
            if (formData.latitude.trim()) {
                payload.latitude = Number.parseFloat(formData.latitude);
            }
            if (formData.longitude.trim()) {
                payload.longitude = Number.parseFloat(formData.longitude);
            }

            await businessApi.update(businessId, payload);

            if (selectedImages.length > 0) {
                const uploadResults = await Promise.allSettled(
                    selectedImages.map((file) => uploadApi.uploadBusinessImage(businessId, file)),
                );
                const failedCount = uploadResults.filter((result) => result.status === 'rejected').length;
                if (failedCount > 0) {
                    setSuccessMessage(`Negocio actualizado. ${failedCount} imagen(es) no se pudieron subir.`);
                } else {
                    setSuccessMessage('Negocio e imagenes actualizados correctamente');
                }
            } else {
                setSuccessMessage('Negocio actualizado correctamente');
            }

            setSelectedImages([]);
            await loadData();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el negocio'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
                <div className="h-10 w-72 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                <div className="h-5 w-96 max-w-full rounded-lg bg-gray-100 animate-pulse mb-8"></div>
                <div className="card p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div key={index} className="h-10 rounded-lg bg-gray-100 animate-pulse"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!business) {
        return (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
                <div className="card p-8">
                    <h1 className="font-display text-2xl font-bold text-gray-900">No se pudo abrir esta edicion</h1>
                    <p className="text-gray-600 mt-2">
                        Verifica que el negocio existe y que pertenece a tu organizacion.
                    </p>
                    {errorMessage && (
                        <p className="mt-3 text-sm text-red-700">{errorMessage}</p>
                    )}
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link to="/dashboard" className="btn-primary">Volver al panel</Link>
                        <Link to="/businesses" className="btn-secondary">Ir al directorio</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-fade-in">
            <section className="role-hero role-hero-owner">
                <p className="text-xs uppercase tracking-[0.16em] text-blue-100 font-semibold">Panel Negocio</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Editar negocio</h1>
                <p className="text-blue-100 mt-2 max-w-2xl">
                    Actualiza la informacion publica de tu negocio y manten su perfil siempre al dia.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                    <Link to="/dashboard" className="btn-secondary">Volver al panel</Link>
                    <Link to={`/businesses/${business.slug || business.id}`} className="btn-primary">
                        Ver perfil publico
                    </Link>
                </div>
            </section>

            {errorMessage && (
                <section role="alert" aria-live="assertive" className="card p-4 border border-red-100 bg-red-50">
                    <p className="text-sm text-red-700">{errorMessage}</p>
                </section>
            )}
            {successMessage && (
                <section role="status" aria-live="polite" className="card p-4 border border-green-100 bg-green-50">
                    <p className="text-sm text-green-700">{successMessage}</p>
                </section>
            )}

            <form onSubmit={(event) => void handleSubmit(event)} className="card p-6 lg:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label htmlFor="edit-business-name" className="text-sm font-medium text-gray-700 mb-1 block">
                            Nombre del negocio *
                        </label>
                        <input
                            id="edit-business-name"
                            className="input-field"
                            value={formData.name}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, name: event.target.value }))
                            }
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="edit-business-description" className="text-sm font-medium text-gray-700 mb-1 block">
                            Descripcion *
                        </label>
                        <textarea
                            id="edit-business-description"
                            rows={5}
                            className="input-field"
                            value={formData.description}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, description: event.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-business-phone" className="text-sm font-medium text-gray-700 mb-1 block">
                            Telefono
                        </label>
                        <input
                            id="edit-business-phone"
                            className="input-field"
                            value={formData.phone}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, phone: event.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-business-whatsapp" className="text-sm font-medium text-gray-700 mb-1 block">
                            WhatsApp
                        </label>
                        <input
                            id="edit-business-whatsapp"
                            className="input-field"
                            value={formData.whatsapp}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, whatsapp: event.target.value }))
                            }
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="edit-business-address" className="text-sm font-medium text-gray-700 mb-1 block">
                            Direccion *
                        </label>
                        <input
                            id="edit-business-address"
                            className="input-field"
                            value={formData.address}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, address: event.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-business-province" className="text-sm font-medium text-gray-700 mb-1 block">
                            Provincia *
                        </label>
                        <select
                            id="edit-business-province"
                            className="input-field"
                            value={formData.provinceId}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    provinceId: event.target.value,
                                    cityId: '',
                                }))
                            }
                        >
                            <option value="">Seleccionar...</option>
                            {provinces.map((province) => (
                                <option key={province.id} value={province.id}>
                                    {province.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-business-city" className="text-sm font-medium text-gray-700 mb-1 block">
                            Ciudad
                        </label>
                        <select
                            id="edit-business-city"
                            className="input-field"
                            value={formData.cityId}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, cityId: event.target.value }))
                            }
                            disabled={!formData.provinceId}
                        >
                            <option value="">Seleccionar...</option>
                            {cities.map((city) => (
                                <option key={city.id} value={city.id}>
                                    {city.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-business-lat" className="text-sm font-medium text-gray-700 mb-1 block">
                            Latitud
                        </label>
                        <input
                            id="edit-business-lat"
                            type="number"
                            step="any"
                            className="input-field"
                            value={formData.latitude}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, latitude: event.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-business-lng" className="text-sm font-medium text-gray-700 mb-1 block">
                            Longitud
                        </label>
                        <input
                            id="edit-business-lng"
                            type="number"
                            step="any"
                            className="input-field"
                            value={formData.longitude}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, longitude: event.target.value }))
                            }
                        />
                    </div>
                </div>

                <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Categorias *</p>
                    <div className="flex flex-wrap gap-2">
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => toggleCategory(category.id)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                    selectedCategorySet.has(category.id)
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                                }`}
                            >
                                {category.icon ? `${category.icon} ` : ''}
                                {category.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Servicios / modalidades</p>
                    <div className="flex flex-wrap gap-2">
                        {features.map((feature) => (
                            <button
                                key={feature.id}
                                type="button"
                                onClick={() => toggleFeature(feature.id)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                    selectedFeatureSet.has(feature.id)
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                                }`}
                            >
                                {feature.name}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Marca "Reservaciones" solo si el negocio realmente trabaja con citas o reservas.
                    </p>
                </div>

                <div className="space-y-4 rounded-xl border border-gray-100 p-4">
                    <div>
                        <h2 className="font-display text-lg font-semibold text-gray-900">Imagenes del negocio</h2>
                        <p className="text-sm text-gray-600">
                            Puedes eliminar imagenes actuales y subir nuevas imagenes.
                        </p>
                    </div>

                    {business.images && business.images.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {business.images.map((image) => (
                                <div key={image.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                                    <div className="h-28 bg-gray-50">
                                        <OptimizedImage
                                            src={image.url}
                                            alt={business.name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div>
                                    <div className="p-2">
                                        <button
                                            type="button"
                                            className="w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                                            onClick={() => void handleDeleteImage(image.id)}
                                            disabled={deletingImageId === image.id}
                                        >
                                            {deletingImageId === image.id ? 'Eliminando...' : 'Eliminar'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">Este negocio aun no tiene imagenes.</p>
                    )}

                    <div>
                        <label htmlFor="edit-business-new-images" className="text-sm font-medium text-gray-700 mb-1 block">
                            Subir nuevas imagenes
                        </label>
                        <input
                            id="edit-business-new-images"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleSelectImages}
                            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-primary-700 hover:file:bg-primary-100"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            Hasta 5 imagenes por envio. Formatos JPG, PNG o WEBP (maximo 5MB c/u).
                        </p>
                        {selectedImages.length > 0 && (
                            <ul className="mt-2 text-xs text-gray-600 space-y-1">
                                {selectedImages.map((imageFile) => (
                                    <li key={`${imageFile.name}-${imageFile.lastModified}`}>
                                        {imageFile.name} ({Math.round(imageFile.size / 1024)} KB)
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" className="btn-primary" disabled={saving}>
                        {saving ? 'Guardando cambios...' : 'Guardar cambios'}
                    </button>
                    <Link to="/dashboard" className="btn-secondary">
                        Cancelar
                    </Link>
                </div>
            </form>
        </div>
    );
}
