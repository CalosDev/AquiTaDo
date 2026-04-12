import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { businessSuggestionApi, categoryApi, locationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useTimedMessage } from '../hooks/useTimedMessage';

type CategoryOption = {
    id: string;
    name: string;
    parentId?: string | null;
};

type ProvinceOption = {
    id: string;
    name: string;
};

type CityOption = {
    id: string;
    name: string;
};

type SuggestionItem = {
    id: string;
    name: string;
    address: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    notes?: string | null;
    category?: { id: string; name: string; slug: string } | null;
    province?: { id: string; name: string; slug: string } | null;
    city?: { id: string; name: string; slug: string } | null;
    reviewedByAdmin?: { id: string; name: string; email: string } | null;
    createdBusiness?: {
        id: string;
        name: string;
        slug: string;
        claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
        publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    } | null;
};

const EMPTY_FORM = {
    name: '',
    description: '',
    categoryId: '',
    address: '',
    provinceId: '',
    cityId: '',
    phone: '',
    whatsapp: '',
    website: '',
    email: '',
    notes: '',
};

function suggestionStatusClass(status: SuggestionItem['status']) {
    if (status === 'APPROVED') {
        return 'border border-primary-200 bg-primary-50 text-primary-700';
    }

    if (status === 'REJECTED') {
        return 'border border-red-200 bg-red-50 text-red-700';
    }

    return 'border border-amber-200 bg-amber-50 text-amber-800';
}

export function SuggestBusiness() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [provinces, setProvinces] = useState<ProvinceOption[]>([]);
    const [cities, setCities] = useState<CityOption[]>([]);
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [summary, setSummary] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const loadReferenceData = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');

        try {
            const [categoriesResponse, provincesResponse, suggestionsResponse] = await Promise.all([
                categoryApi.getAll(),
                locationApi.getProvinces(),
                businessSuggestionApi.getMine({ limit: 20 }),
            ]);

            setCategories((categoriesResponse.data || []) as CategoryOption[]);
            setProvinces((provincesResponse.data || []) as ProvinceOption[]);
            setSuggestions((suggestionsResponse.data?.data || []) as SuggestionItem[]);
            setSummary((suggestionsResponse.data?.summary || {}) as Record<string, number>);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el flujo de sugerencias'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadReferenceData();
    }, [loadReferenceData]);

    useEffect(() => {
        if (!form.provinceId) {
            setCities([]);
            if (form.cityId) {
                setForm((current) => ({ ...current, cityId: '' }));
            }
            return;
        }

        let active = true;
        void locationApi.getCities(form.provinceId)
            .then((response) => {
                if (!active) {
                    return;
                }

                const nextCities = (response.data || []) as CityOption[];
                setCities(nextCities);

                if (form.cityId && !nextCities.some((city) => city.id === form.cityId)) {
                    setForm((current) => ({ ...current, cityId: '' }));
                }
            })
            .catch(() => {
                if (active) {
                    setCities([]);
                }
            });

        return () => {
            active = false;
        };
    }, [form.cityId, form.provinceId]);

    const categoryOptions = useMemo(
        () => [...categories].sort((left, right) => left.name.localeCompare(right.name, 'es')),
        [categories],
    );

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessSuggestionApi.create({
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                categoryId: form.categoryId || undefined,
                address: form.address.trim(),
                provinceId: form.provinceId,
                cityId: form.cityId || undefined,
                phone: form.phone.trim() || undefined,
                whatsapp: form.whatsapp.trim() || undefined,
                website: form.website.trim() || undefined,
                email: form.email.trim() || undefined,
                notes: form.notes.trim() || undefined,
            });

            setForm(EMPTY_FORM);
            await loadReferenceData();
            setSuccessMessage('Sugerencia enviada. El equipo admin la revisara antes de publicar la ficha.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la sugerencia'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="page-shell max-w-6xl animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'suggest-business-error', tone: 'danger', text: errorMessage },
                    { id: 'suggest-business-success', tone: 'success', text: successMessage },
                ]}
            />

            <section className="role-hero role-hero-customer mb-8">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-200 font-semibold">Sugerencia de catalogo</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Ayudanos a crecer el catalogo</h1>
                <p className="text-slate-200 mt-2 max-w-2xl">
                    Si conoces un negocio que aun no aparece en AquiTa.do, envialo para revision. El equipo admin valida la informacion y lo publica como ficha no reclamada.
                </p>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <section className="card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-display text-xl font-semibold text-slate-900">Nueva sugerencia</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                Prioriza nombre, direccion y una forma de contacto para que la moderacion pueda validar la ficha rapido.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={() => void loadReferenceData()}
                            disabled={loading}
                        >
                            {loading ? 'Actualizando...' : 'Actualizar'}
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-5 grid gap-3 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Nombre del negocio
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="Ej. Cafe del Malecón"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Categoria
                            </label>
                            <select
                                className="input-field text-sm"
                                value={form.categoryId}
                                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                            >
                                <option value="">Selecciona categoria</option>
                                {categoryOptions.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Direccion
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.address}
                                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                                placeholder="Direccion o referencia clara"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Provincia
                            </label>
                            <select
                                className="input-field text-sm"
                                value={form.provinceId}
                                onChange={(event) => setForm((current) => ({
                                    ...current,
                                    provinceId: event.target.value,
                                    cityId: '',
                                }))}
                            >
                                <option value="">Selecciona provincia</option>
                                {provinces.map((province) => (
                                    <option key={province.id} value={province.id}>
                                        {province.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Ciudad
                            </label>
                            <select
                                className="input-field text-sm"
                                value={form.cityId}
                                onChange={(event) => setForm((current) => ({ ...current, cityId: event.target.value }))}
                                disabled={!form.provinceId || cities.length === 0}
                            >
                                <option value="">Ciudad opcional</option>
                                {cities.map((city) => (
                                    <option key={city.id} value={city.id}>
                                        {city.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Descripcion breve
                            </label>
                            <textarea
                                className="input-field min-h-[110px] text-sm"
                                value={form.description}
                                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                                placeholder="Que vende, que lo hace util o como ubicarlo mejor."
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Telefono
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.phone}
                                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                                placeholder="809..."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                WhatsApp
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.whatsapp}
                                onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))}
                                placeholder="829..."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Sitio web
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.website}
                                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                                placeholder="https://..."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Email
                            </label>
                            <input
                                className="input-field text-sm"
                                value={form.email}
                                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                placeholder="contacto@negocio.com"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Notas para moderacion
                            </label>
                            <textarea
                                className="input-field min-h-[120px] text-sm"
                                value={form.notes}
                                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                placeholder="Comparte referencias, redes, horario o cualquier pista que ayude a validar la ficha."
                            />
                        </div>

                        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                            <button
                                type="submit"
                                className="btn-primary text-sm"
                                disabled={submitting}
                            >
                                {submitting ? 'Enviando...' : 'Enviar sugerencia'}
                            </button>
                            <p className="text-sm text-slate-600">
                                El negocio entra a moderacion y, si se aprueba, se publica como perfil no reclamado para que luego el dueno pueda hacer claim.
                            </p>
                        </div>
                    </form>
                </section>

                <aside className="space-y-4">
                    <section className="card p-5">
                        <h2 className="font-display text-lg font-semibold text-slate-900">Estado de mis sugerencias</h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                                <span
                                    key={status}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                                >
                                    {status}: {summary[status] ?? 0}
                                </span>
                            ))}
                        </div>

                        <div className="mt-4 space-y-3">
                            {loading ? (
                                <p className="text-sm text-slate-500">Cargando historial...</p>
                            ) : suggestions.length > 0 ? (
                                suggestions.map((suggestion) => (
                                    <article key={suggestion.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-medium text-slate-900">{suggestion.name}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {[suggestion.city?.name, suggestion.province?.name].filter(Boolean).join(', ') || suggestion.address}
                                                </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${suggestionStatusClass(suggestion.status)}`}>
                                                {suggestion.status}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">
                                            Enviada {new Date(suggestion.createdAt).toLocaleDateString('es-DO')}
                                        </p>
                                        {suggestion.createdBusiness ? (
                                            <Link
                                                to={`/businesses/${suggestion.createdBusiness.slug || suggestion.createdBusiness.id}`}
                                                className="mt-3 inline-flex text-sm font-semibold text-primary-700 hover:text-primary-800"
                                            >
                                                Ver ficha publicada
                                            </Link>
                                        ) : null}
                                        {suggestion.notes ? (
                                            <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{suggestion.notes}</p>
                                        ) : null}
                                    </article>
                                ))
                            ) : (
                                <p className="text-sm text-slate-500">
                                    Aun no has enviado sugerencias. Cuando compartas una, podras seguir aqui su estado.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="card p-5">
                        <h2 className="font-display text-lg font-semibold text-slate-900">Como priorizamos</h2>
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                            <p>1. Nombre y direccion claros para evitar duplicados.</p>
                            <p>2. Alguna via de contacto para validar existencia y calidad.</p>
                            <p>3. Categoria y notas que ayuden a publicar la ficha mas rapido.</p>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
