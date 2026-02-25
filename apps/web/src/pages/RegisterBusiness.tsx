import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { businessApi, categoryApi, locationApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';

interface Category {
    id: string;
    name: string;
    icon?: string;
}

interface Province {
    id: string;
    name: string;
}

interface City {
    id: string;
    name: string;
}

export function RegisterBusiness() {
    const navigate = useNavigate();
    const { refreshProfile } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loadingData, setLoadingData] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        phone: '',
        whatsapp: '',
        address: '',
        provinceId: '',
        cityId: '',
        latitude: '',
        longitude: '',
        categoryIds: [] as string[],
    });

    useEffect(() => {
        loadFormData();
    }, []);

    useEffect(() => {
        if (formData.provinceId) {
            loadCities(formData.provinceId);
        }
    }, [formData.provinceId]);

    const loadFormData = async () => {
        setLoadingData(true);
        try {
            const [catRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data);
            setProvinces(provRes.data);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'No se pudieron cargar categorías y provincias'));
        } finally {
            setLoadingData(false);
        }
    };

    const loadCities = async (provinceId: string) => {
        try {
            const res = await locationApi.getCities(provinceId);
            setCities(res.data);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'No se pudieron cargar las ciudades de la provincia'));
        }
    };

    const toggleCategory = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            categoryIds: prev.categoryIds.includes(id)
                ? prev.categoryIds.filter((c) => c !== id)
                : [...prev.categoryIds, id],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const payload: Record<string, unknown> = {
                name: formData.name,
                description: formData.description,
                address: formData.address,
                provinceId: formData.provinceId,
                categoryIds: formData.categoryIds,
            };

            if (formData.phone) payload.phone = formData.phone;
            if (formData.whatsapp) payload.whatsapp = formData.whatsapp;
            if (formData.cityId) payload.cityId = formData.cityId;
            if (formData.latitude) {
                const parsedLatitude = Number.parseFloat(formData.latitude);
                if (!Number.isFinite(parsedLatitude)) {
                    setError('La latitud ingresada no es válida');
                    setLoading(false);
                    return;
                }
                payload.latitude = parsedLatitude;
            }
            if (formData.longitude) {
                const parsedLongitude = Number.parseFloat(formData.longitude);
                if (!Number.isFinite(parsedLongitude)) {
                    setError('La longitud ingresada no es válida');
                    setLoading(false);
                    return;
                }
                payload.longitude = parsedLongitude;
            }

            const res = await businessApi.create(payload);
            await refreshProfile();
            navigate(`/businesses/${res.data.id}`);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'Error al registrar negocio'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <div className="card p-8">
                <div className="text-center mb-8">
                    <h1 className="font-display text-3xl font-bold text-gray-900">Registra tu Negocio</h1>
                    <p className="text-gray-500 mt-2">
                        Llega a miles de clientes en República Dominicana
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
                        {error}
                    </div>
                )}

                {loadingData ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div>
                        <h3 className="font-display font-semibold text-gray-800 mb-3">Información Básica</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Nombre del negocio *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="input-field"
                                    placeholder="Mi Negocio RD"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Descripción *</label>
                                <textarea
                                    required
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="input-field"
                                    rows={4}
                                    placeholder="Describe tu negocio, productos y servicios..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="font-display font-semibold text-gray-800 mb-3">Contacto</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Teléfono</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="input-field"
                                    placeholder="+1 809-555-0000"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">WhatsApp</label>
                                <input
                                    type="tel"
                                    value={formData.whatsapp}
                                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                                    className="input-field"
                                    placeholder="+1 809-555-0000"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Location */}
                    <div>
                        <h3 className="font-display font-semibold text-gray-800 mb-3">Ubicación</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Dirección *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="input-field"
                                    placeholder="Calle Principal #123, Santo Domingo"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">Provincia *</label>
                                    <select
                                        required
                                        value={formData.provinceId}
                                        onChange={(e) => setFormData({ ...formData, provinceId: e.target.value, cityId: '' })}
                                        className="input-field"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {provinces.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">Ciudad</label>
                                    <select
                                        value={formData.cityId}
                                        onChange={(e) => setFormData({ ...formData, cityId: e.target.value })}
                                        className="input-field"
                                        disabled={!formData.provinceId}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {cities.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">Latitud</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.latitude}
                                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                                        className="input-field"
                                        placeholder="18.4861"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 mb-1 block">Longitud</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.longitude}
                                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                                        className="input-field"
                                        placeholder="-69.9312"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Categories */}
                    <div>
                        <h3 className="font-display font-semibold text-gray-800 mb-3">Categorías</h3>
                        <div className="flex flex-wrap gap-2">
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => toggleCategory(cat.id)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${formData.categoryIds.includes(cat.id)
                                            ? 'bg-primary-600 text-white border-primary-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
                                        }`}
                                >
                                    {cat.icon} {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="btn-primary w-full text-lg py-3.5">
                        {loading ? 'Registrando...' : 'Registrar Negocio'}
                    </button>
                    </form>
                )}
            </div>
        </div>
    );
}
