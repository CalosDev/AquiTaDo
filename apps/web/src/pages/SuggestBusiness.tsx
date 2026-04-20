import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { businessSuggestionApi, categoryApi, locationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import {
    ActionBar,
    AppCard,
    DashboardContentLayout,
    EmptyState,
    FieldHint,
    FormSection,
    InfoList,
    LoadingState,
    MetricCard,
    PageIntroCompact,
    PageShell,
    QueueCard,
    StickyFormActions,
    Toolbar,
} from '../components/ui';
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

function suggestionStatusLabel(status: SuggestionItem['status']) {
    if (status === 'APPROVED') {
        return 'Aprobada';
    }

    if (status === 'REJECTED') {
        return 'No aprobada';
    }

    return 'En revision';
}

function suggestionStatusClass(status: SuggestionItem['status']) {
    if (status === 'APPROVED') {
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    if (status === 'REJECTED') {
        return 'border border-rose-200 bg-rose-50 text-rose-700';
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

    const summaryCards = useMemo(() => ([
        {
            label: 'En revision',
            value: summary.PENDING ?? 0,
            delta: 'Sugerencias esperando validacion',
        },
        {
            label: 'Aprobadas',
            value: summary.APPROVED ?? 0,
            delta: 'Negocios que ya pasaron revision',
        },
        {
            label: 'No aprobadas',
            value: summary.REJECTED ?? 0,
            delta: 'Envios que necesitan mejor informacion',
        },
    ]), [summary]);

    const moderationGuide = useMemo(() => ([
        {
            label: 'Lo que mas ayuda',
            value: 'Nombre, direccion y una pista clara para ubicar el negocio',
            hint: 'Eso evita duplicados y reduce el tiempo de revision.',
        },
        {
            label: 'Contacto',
            value: 'Telefono, WhatsApp, email o web',
            hint: 'Con una via real de contacto es mucho mas facil validar la ficha.',
        },
        {
            label: 'Notas utiles',
            value: 'Horarios, referencias, redes o cualquier detalle de contexto',
            hint: 'No hace falta escribir mucho, solo lo suficiente para orientar al equipo.',
        },
    ]), []);

    const handleSubmit = async (event: FormEvent) => {
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
            setSuccessMessage('Sugerencia enviada. El equipo la revisara antes de crear la ficha publica.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la sugerencia'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <PageShell width="wide" className="animate-fade-in py-10">
            <PageFeedbackStack
                items={[
                    { id: 'suggest-business-error', tone: 'danger', text: errorMessage },
                    { id: 'suggest-business-success', tone: 'success', text: successMessage },
                ]}
            />

            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow="Crecimiento del catalogo"
                    title="Sugerir un negocio"
                    description="Si conoces un lugar que todavia no aparece en AquiTa.do, puedes compartirlo aqui para que el equipo lo revise y lo publique con mejor contexto."
                />

                <Toolbar
                    leading={(
                        <p className="max-w-3xl text-sm leading-6 text-slate-600">
                            No necesitas llenar todo. Si dejas claro el nombre, la ubicacion y una via de contacto,
                            ya nos ayudas mucho a validar mas rapido.
                        </p>
                    )}
                    trailing={(
                        <ActionBar>
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={() => void loadReferenceData()}
                                disabled={loading}
                            >
                                {loading ? 'Actualizando...' : 'Recargar datos'}
                            </button>
                            <Link to="/businesses" className="btn-primary text-sm">
                                Ver catalogo
                            </Link>
                        </ActionBar>
                    )}
                />

                {loading ? (
                    <LoadingState label="Cargando el flujo de sugerencias..." />
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {summaryCards.map((card) => (
                            <MetricCard key={card.label} label={card.label} value={card.value} delta={card.delta} />
                        ))}
                    </div>
                )}
            </AppCard>

            <DashboardContentLayout
                primary={(
                    <AppCard
                        title="Nueva sugerencia"
                        description="Separa lo esencial del contexto adicional para que el formulario se sienta mas ligero."
                    >
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <FormSection
                                title="Lo esencial"
                                description="Con esto podemos empezar a revisar si el negocio existe y no esta duplicado."
                            >
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
                                            Nombre del negocio
                                        </label>
                                        <input
                                            className="input-field text-sm"
                                            value={form.name}
                                            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                            placeholder="Ej. Cafe del Malecon"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
                                            Categoria
                                        </label>
                                        <select
                                            className="input-field text-sm"
                                            value={form.categoryId}
                                            onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                                        >
                                            <option value="">Selecciona una categoria</option>
                                            {categoryOptions.map((category) => (
                                                <option key={category.id} value={category.id}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                        Direccion o referencia
                                    </label>
                                    <input
                                        className="input-field text-sm"
                                        value={form.address}
                                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                                        placeholder="Direccion clara, punto de referencia o ubicacion facil de reconocer"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                        Descripcion breve
                                    </label>
                                    <textarea
                                        className="input-field min-h-[120px] text-sm"
                                        value={form.description}
                                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                                        placeholder="Que vende, que resuelve o como lo reconoceria alguien de la zona."
                                    />
                                </div>

                                <FieldHint>
                                    Si no conoces la categoria exacta, puedes dejarla vacia y nosotros la afinamos en revision.
                                </FieldHint>
                            </FormSection>

                            <FormSection
                                title="Ubicacion"
                                description="Ayuda a ubicar el negocio dentro del mapa real de uso."
                            >
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
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
                                            <option value="">Selecciona una provincia</option>
                                            {provinces.map((province) => (
                                                <option key={province.id} value={province.id}>
                                                    {province.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
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
                                </div>
                            </FormSection>

                            <FormSection
                                title="Contacto"
                                description="Con una via valida de contacto es mucho mas facil aprobar la sugerencia."
                            >
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
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
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
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
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
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
                                        <label className="mb-1 block text-sm font-medium text-slate-700">
                                            Email
                                        </label>
                                        <input
                                            className="input-field text-sm"
                                            value={form.email}
                                            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                            placeholder="contacto@negocio.com"
                                        />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection
                                title="Notas de apoyo"
                                description="Comparte cualquier pista adicional que haga mas facil revisar la ficha."
                            >
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">
                                        Informacion extra
                                    </label>
                                    <textarea
                                        className="input-field min-h-[140px] text-sm"
                                        value={form.notes}
                                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                        placeholder="Horarios, redes, referencias, si ya lo visitaste o cualquier detalle que ayude a confirmar que el negocio existe."
                                    />
                                </div>
                            </FormSection>

                            <StickyFormActions>
                                <button type="submit" className="btn-primary text-sm" disabled={submitting}>
                                    {submitting ? 'Enviando...' : 'Enviar sugerencia'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary text-sm"
                                    onClick={() => setForm(EMPTY_FORM)}
                                    disabled={submitting}
                                >
                                    Limpiar formulario
                                </button>
                                <p className="text-sm text-slate-600">
                                    Si se aprueba, el negocio se publica como ficha no reclamada para que luego su dueno pueda gestionarla.
                                </p>
                            </StickyFormActions>
                        </form>
                    </AppCard>
                )}
                secondary={(
                    <div className="space-y-5">
                        <AppCard
                            title="Tus sugerencias recientes"
                            description="Una vista rapida para saber en que va cada envio."
                        >
                            {loading ? (
                                <LoadingState label="Cargando historial..." size="sm" />
                            ) : suggestions.length > 0 ? (
                                <div className="space-y-3">
                                    {suggestions.map((suggestion) => (
                                        <QueueCard
                                            key={suggestion.id}
                                            title={suggestion.name}
                                            description={
                                                [suggestion.city?.name, suggestion.province?.name].filter(Boolean).join(', ')
                                                || suggestion.address
                                            }
                                            actions={(
                                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${suggestionStatusClass(suggestion.status)}`}>
                                                    {suggestionStatusLabel(suggestion.status)}
                                                </span>
                                            )}
                                        >
                                            <p className="text-sm text-slate-600">
                                                Enviada el {new Date(suggestion.createdAt).toLocaleDateString('es-DO')}
                                            </p>
                                            {suggestion.notes ? (
                                                <p className="mt-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">{suggestion.notes}</p>
                                            ) : null}
                                            {suggestion.createdBusiness ? (
                                                <div className="mt-4">
                                                    <Link
                                                        to={`/businesses/${suggestion.createdBusiness.slug || suggestion.createdBusiness.id}`}
                                                        className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                                                    >
                                                        Ver ficha publicada
                                                    </Link>
                                                </div>
                                            ) : null}
                                        </QueueCard>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    title="Aun no has enviado sugerencias"
                                    body="Cuando compartas un negocio nuevo, aqui podras seguir su estado sin perderlo de vista."
                                />
                            )}
                        </AppCard>

                        <AppCard
                            title="Que nos ayuda a priorizar"
                            description="Tres cosas que hacen que una sugerencia pase mejor la revision."
                        >
                            <InfoList items={moderationGuide} />
                        </AppCard>
                    </div>
                )}
            />
        </PageShell>
    );
}
