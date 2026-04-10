import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { businessApi, categoryApi, featuresApi, locationApi, uploadApi } from '../api/endpoints';
import { BusyButtonLabel } from '../components/BusyButtonLabel';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';
import { evaluateBusinessSubmissionGuidance } from '../lib/businessSubmissionGuidance';
import { trackGrowthEvent as trackGrowthSignal } from '../lib/growthTracking';
import {
    BUSINESS_PRICE_RANGE_OPTIONS,
    businessPriceRangeLabel,
    createDefaultBusinessHours,
    type BusinessHourEntry,
} from '../lib/businessProfile';
import { formatPublicCategoryIcon, formatPublicCategoryPath } from '../lib/categoryLabel';
import {
    getRegisterStepActionLabel,
    getRegisterStepTips,
    getRegisterStepUnlock,
    REGISTER_STEP_TITLES,
    TOTAL_REGISTER_STEPS,
    type RegisterStep,
} from './register-business/flow';

interface Category {
    id: string;
    name: string;
    icon?: string;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    children?: Array<{ id: string }>;
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

interface Sector {
    id: string;
    name: string;
}

const BOOKING_FEATURE_CANONICAL = 'reservaciones';

const BusinessHoursEditor = lazy(async () => ({
    default: (await import('../components/BusinessHoursEditor')).BusinessHoursEditor,
}));

const PublicationGuidancePanel = lazy(async () => ({
    default: (await import('./register-business/PublicationGuidancePanel')).PublicationGuidancePanel,
}));

function RegisterStepSectionFallback({ rows = 4 }: { rows?: number }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
            <div className="h-4 w-36 rounded-full bg-gray-200 animate-pulse"></div>
            <div className="mt-3 space-y-3">
                {Array.from({ length: rows }).map((_, index) => (
                    <div key={index} className="h-12 rounded-xl bg-white animate-pulse"></div>
                ))}
            </div>
        </div>
    );
}

export function RegisterBusiness() {
    const navigate = useNavigate();
    const { refreshProfile } = useAuth();
    const { refreshOrganizations, setActiveOrganizationId } = useOrganization();

    const [categories, setCategories] = useState<Category[]>([]);
    const [features, setFeatures] = useState<Feature[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [selectedImages, setSelectedImages] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState('');
    const [currentStep, setCurrentStep] = useState<RegisterStep>(1);
    const trackedOnboardingStepsRef = useRef<Set<RegisterStep>>(new Set());
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        phone: '',
        whatsapp: '',
        website: '',
        email: '',
        instagramUrl: '',
        facebookUrl: '',
        tiktokUrl: '',
        priceRange: '',
        address: '',
        provinceId: '',
        cityId: '',
        sectorId: '',
        latitude: '',
        longitude: '',
        categoryIds: [] as string[],
        featureIds: [] as string[],
        hours: createDefaultBusinessHours() as BusinessHourEntry[],
    });

    const progressPercentage = useMemo(
        () => Math.round((currentStep / TOTAL_REGISTER_STEPS) * 100),
        [currentStep],
    );
    const categoryOptions = useMemo(
        () => categories.filter((category) => !category.children || category.children.length === 0),
        [categories],
    );
    const submissionGuidance = useMemo(
        () => evaluateBusinessSubmissionGuidance({
            name: formData.name,
            description: formData.description,
            phone: formData.phone,
            whatsapp: formData.whatsapp,
            website: formData.website,
            email: formData.email,
            address: formData.address,
            provinceId: formData.provinceId,
            cityId: formData.cityId,
            sectorId: formData.sectorId,
            categoryIds: formData.categoryIds,
            featureIds: formData.featureIds,
            imageCount: selectedImages.length,
        }),
        [formData, selectedImages.length],
    );
    const currentStepMeta = useMemo(
        () => REGISTER_STEP_TITLES.find((item) => item.step === currentStep) ?? REGISTER_STEP_TITLES[0],
        [currentStep],
    );
    const currentStepUnlock = useMemo(
        () => getRegisterStepUnlock(currentStep),
        [currentStep],
    );
    const currentStepTips = useMemo(() => getRegisterStepTips(currentStep), [currentStep]);
    const currentStepActionLabel = useMemo(
        () => getRegisterStepActionLabel(currentStep),
        [currentStep],
    );
    const descriptionLength = formData.description.trim().length;
    const completedVisibilityChecks = submissionGuidance.visibilityChecks.filter((check) => check.passed).length;
    const remainingPublishNeeds = submissionGuidance.missingCriticalFields;

    const trackOnboardingEvent = useCallback((
        eventType: 'BUSINESS_ONBOARDING_STEP' | 'BUSINESS_ONBOARDING_COMPLETE',
        metadata: Record<string, unknown>,
        overrides: { businessId?: string } = {},
    ) => {
        void trackGrowthSignal({
            eventType,
            businessId: overrides.businessId,
            categoryId: formData.categoryIds[0] || undefined,
            provinceId: formData.provinceId || undefined,
            cityId: formData.cityId || undefined,
            metadata: {
                step: currentStep,
                stepTitle: currentStepMeta.title,
                stepSubtitle: currentStepMeta.subtitle,
                progressPercentage,
                categoriesSelected: formData.categoryIds.length,
                featuresSelected: formData.featureIds.length,
                hasPhone: Boolean(formData.phone.trim()),
                hasWhatsApp: Boolean(formData.whatsapp.trim()),
                hasWebsite: Boolean(formData.website.trim()),
                hasEmail: Boolean(formData.email.trim()),
                hasAddress: Boolean(formData.address.trim()),
                selectedImages: selectedImages.length,
                ...metadata,
            },
        });
    }, [
        currentStep,
        currentStepMeta.subtitle,
        currentStepMeta.title,
        formData.address,
        formData.categoryIds,
        formData.cityId,
        formData.email,
        formData.featureIds,
        formData.phone,
        formData.provinceId,
        formData.website,
        formData.whatsapp,
        progressPercentage,
        selectedImages.length,
    ]);

    useEffect(() => {
        void loadFormData();
    }, []);

    useEffect(() => {
        if (trackedOnboardingStepsRef.current.has(currentStep)) {
            return;
        }

        trackedOnboardingStepsRef.current.add(currentStep);
        trackOnboardingEvent('BUSINESS_ONBOARDING_STEP', {
            action: 'step_visible',
            step: currentStep,
            stepTitle: currentStepMeta.title,
            stepSubtitle: currentStepMeta.subtitle,
        });
    }, [currentStep, currentStepMeta.subtitle, currentStepMeta.title, trackOnboardingEvent]);

    useEffect(() => {
        if (!formData.provinceId) {
            setCities([]);
            setSectors([]);
            setFormData((previous) => ({ ...previous, cityId: '', sectorId: '' }));
            return;
        }
        void loadCities(formData.provinceId);
    }, [formData.provinceId]);

    useEffect(() => {
        if (!formData.cityId) {
            setSectors([]);
            setFormData((previous) => ({ ...previous, sectorId: '' }));
            return;
        }

        void loadSectors(formData.cityId);
    }, [formData.cityId]);

    const loadFormData = async () => {
        setLoadingData(true);
        try {
            const [catRes, featRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                featuresApi.getAll(),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data || []);
            setFeatures(featRes.data || []);
            setProvinces(provRes.data || []);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'No se pudieron cargar categorias y provincias'));
        } finally {
            setLoadingData(false);
        }
    };

    const loadCities = async (provinceId: string) => {
        try {
            const res = await locationApi.getCities(provinceId);
            setCities(res.data || []);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'No se pudieron cargar las ciudades'));
        }
    };

    const loadSectors = async (cityId: string) => {
        try {
            const res = await locationApi.getSectors(cityId);
            setSectors(res.data || []);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'No se pudieron cargar los sectores'));
        }
    };

    const toggleCategory = (id: string) => {
        setFormData((previous) => ({
            ...previous,
            categoryIds: previous.categoryIds.includes(id)
                ? previous.categoryIds.filter((categoryId) => categoryId !== id)
                : [...previous.categoryIds, id],
        }));
    };

    const toggleFeature = (id: string) => {
        setFormData((previous) => ({
            ...previous,
            featureIds: previous.featureIds.includes(id)
                ? previous.featureIds.filter((featureId) => featureId !== id)
                : [...previous.featureIds, id],
        }));
    };

    const validateStep = (step: RegisterStep): string | null => {
        if (step === 1) {
            if (formData.name.trim().length < 3) {
                return 'El nombre del negocio debe tener al menos 3 caracteres';
            }
            if (formData.description.trim().length < 20) {
                return 'La descripcion debe tener al menos 20 caracteres';
            }
        }

        if (step === 3) {
            if (!formData.address.trim()) {
                return 'La direccion es obligatoria';
            }
            if (!formData.provinceId) {
                return 'Debes seleccionar una provincia';
            }
            if (formData.cityId && sectors.length > 0 && !formData.sectorId) {
                return 'Selecciona un sector para mejorar el discovery local';
            }
        }

        if (step === 4 && formData.categoryIds.length === 0) {
            return 'Selecciona al menos una categoria para publicar el negocio';
        }

        return null;
    };

    const goToStep = (step: RegisterStep) => {
        if (step < currentStep) {
            setError('');
            setCurrentStep(step);
        }
    };

    const handlePreviousStep = () => {
        setError('');
        setCurrentStep((previous) => (previous > 1 ? ((previous - 1) as RegisterStep) : previous));
    };

    const handleNextStep = () => {
        const validationError = validateStep(currentStep);
        if (validationError) {
            setError(validationError);
            return;
        }

        setError('');
        setCurrentStep((previous) =>
            previous < TOTAL_REGISTER_STEPS ? ((previous + 1) as RegisterStep) : previous,
        );
    };

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Tu navegador no permite geolocalizacion');
            return;
        }

        setError('');
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData((previous) => ({
                    ...previous,
                    latitude: position.coords.latitude.toFixed(6),
                    longitude: position.coords.longitude.toFixed(6),
                }));
                setLocating(false);
            },
            () => {
                setError('No se pudo obtener la ubicacion actual');
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 12000 },
        );
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

    const submitBusiness = async () => {
        setLoading(true);
        setError('');

        try {
            const payload: Record<string, unknown> = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                address: formData.address.trim(),
                provinceId: formData.provinceId,
                categoryIds: formData.categoryIds,
                hours: formData.hours.map((entry) => ({
                    dayOfWeek: entry.dayOfWeek,
                    opensAt: entry.closed ? undefined : entry.opensAt,
                    closesAt: entry.closed ? undefined : entry.closesAt,
                    closed: entry.closed,
                })),
            };

            if (formData.phone.trim()) payload.phone = formData.phone.trim();
            if (formData.whatsapp.trim()) payload.whatsapp = formData.whatsapp.trim();
            if (formData.website.trim()) payload.website = formData.website.trim();
            if (formData.email.trim()) payload.email = formData.email.trim();
            if (formData.instagramUrl.trim()) payload.instagramUrl = formData.instagramUrl.trim();
            if (formData.facebookUrl.trim()) payload.facebookUrl = formData.facebookUrl.trim();
            if (formData.tiktokUrl.trim()) payload.tiktokUrl = formData.tiktokUrl.trim();
            if (formData.priceRange) payload.priceRange = formData.priceRange;
            if (formData.cityId) payload.cityId = formData.cityId;
            if (formData.sectorId) payload.sectorId = formData.sectorId;
            if (formData.featureIds.length > 0) payload.featureIds = formData.featureIds;

            if (formData.latitude.trim()) {
                const parsedLatitude = Number.parseFloat(formData.latitude);
                if (!Number.isFinite(parsedLatitude)) {
                    setError('La latitud ingresada no es valida');
                    setLoading(false);
                    return;
                }
                payload.latitude = parsedLatitude;
            }

            if (formData.longitude.trim()) {
                const parsedLongitude = Number.parseFloat(formData.longitude);
                if (!Number.isFinite(parsedLongitude)) {
                    setError('La longitud ingresada no es valida');
                    setLoading(false);
                    return;
                }
                payload.longitude = parsedLongitude;
            }

            const response = await businessApi.create(payload);
            const createdBusinessId = response.data.id as string;
            const createdBusinessSlug = (response.data.slug || response.data.id) as string;
            const createdOrganizationId = (response.data.organization?.id ||
                response.data.organizationId ||
                null) as string | null;

            trackOnboardingEvent('BUSINESS_ONBOARDING_COMPLETE', {
                step: TOTAL_REGISTER_STEPS,
                completed: true,
                imagesUploaded: selectedImages.length,
                categoriesSelected: formData.categoryIds.length,
                featuresSelected: formData.featureIds.length,
            }, { businessId: createdBusinessId });

            await refreshProfile();
            if (createdOrganizationId) {
                setActiveOrganizationId(createdOrganizationId);
                await refreshOrganizations(createdOrganizationId);
            } else {
                await refreshOrganizations();
            }

            if (selectedImages.length > 0) {
                const uploadResults = await Promise.allSettled(
                    selectedImages.map((file) =>
                        uploadApi.uploadBusinessImage(createdBusinessId, file),
                    ),
                );
                const failedUploads = uploadResults.filter((result) => result.status === 'rejected');
                if (failedUploads.length > 0) {
                    window.alert(
                        `Negocio publicado. ${failedUploads.length} imagen(es) no se pudieron subir; puedes intentarlo luego desde el panel.`,
                    );
                }
            }

            navigate(`/businesses/${createdBusinessSlug}`);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'Error al registrar negocio'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (currentStep < TOTAL_REGISTER_STEPS) {
            handleNextStep();
            return;
        }

        const validationError = validateStep(currentStep);
        if (validationError) {
            setError(validationError);
            return;
        }

        if (submissionGuidance.blockedByLocalHeuristics) {
            setError(
                `La ficha todavia muestra senales que probablemente activaran revision preventiva: ${submissionGuidance.preventiveSignals.map((signal) => signal.reason).join('; ')}. Corrigela antes de publicar.`,
            );
            return;
        }

        await submitBusiness();
    };

    const renderStepBody = () => {
        if (currentStep === 1) {
            return (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="register-business-name" className="text-sm font-medium text-gray-700 mb-1 block">
                            Nombre del negocio *
                        </label>
                        <input
                            id="register-business-name"
                            type="text"
                            value={formData.name}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, name: event.target.value }))
                            }
                            className="input-field"
                            placeholder="Mi negocio RD"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-description" className="text-sm font-medium text-gray-700 mb-1 block">
                            Descripcion *
                        </label>
                        <textarea
                            id="register-business-description"
                            rows={5}
                            value={formData.description}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, description: event.target.value }))
                            }
                            className="input-field"
                            placeholder="Describe claramente qué vendes, en qué zona operas y qué te diferencia"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Mientras mas clara sea la descripcion, mejor posicionara en resultados.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            <span className={`rounded-full px-2 py-0.5 ${
                                descriptionLength >= 60
                                    ? 'bg-primary-50 text-primary-700'
                                    : 'bg-amber-50 text-amber-700'
                            }`}>
                                {descriptionLength} caracteres
                            </span>
                            <span>Objetivo recomendado: 60+ con propuesta, zona y diferenciador.</span>
                        </div>
                        {submissionGuidance.preventiveSignals.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                <p className="font-semibold">Riesgo preventivo detectado en la descripcion</p>
                                <ul className="mt-2 space-y-1">
                                    {submissionGuidance.preventiveSignals.map((signal) => (
                                        <li key={signal.reason}>
                                            {signal.reason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                </div>
            );
        }

        if (currentStep === 2) {
            return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="register-business-phone" className="text-sm font-medium text-gray-700 mb-1 block">
                            Teléfono
                        </label>
                        <input
                            id="register-business-phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, phone: event.target.value }))
                            }
                            className="input-field"
                            placeholder="+1 809-555-0000"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-whatsapp" className="text-sm font-medium text-gray-700 mb-1 block">
                            WhatsApp
                        </label>
                        <input
                            id="register-business-whatsapp"
                            type="tel"
                            value={formData.whatsapp}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, whatsapp: event.target.value }))
                            }
                            className="input-field"
                            placeholder="+1 809-555-0000"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-website" className="text-sm font-medium text-gray-700 mb-1 block">
                            Website
                        </label>
                        <input
                            id="register-business-website"
                            type="url"
                            value={formData.website}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, website: event.target.value }))
                            }
                            className="input-field"
                            placeholder="https://negocio.do"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-email" className="text-sm font-medium text-gray-700 mb-1 block">
                            Email
                        </label>
                        <input
                            id="register-business-email"
                            type="email"
                            value={formData.email}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, email: event.target.value }))
                            }
                            className="input-field"
                            placeholder="hola@negocio.do"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-price-range" className="text-sm font-medium text-gray-700 mb-1 block">
                            Rango de precio
                        </label>
                        <select
                            id="register-business-price-range"
                            value={formData.priceRange}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, priceRange: event.target.value }))
                            }
                            className="input-field"
                        >
                            <option value="">Sin definir</option>
                            {BUSINESS_PRICE_RANGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="register-business-instagram" className="text-sm font-medium text-gray-700 mb-1 block">
                            Instagram
                        </label>
                        <input
                            id="register-business-instagram"
                            type="url"
                            value={formData.instagramUrl}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, instagramUrl: event.target.value }))
                            }
                            className="input-field"
                            placeholder="https://instagram.com/tu-negocio"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-facebook" className="text-sm font-medium text-gray-700 mb-1 block">
                            Facebook
                        </label>
                        <input
                            id="register-business-facebook"
                            type="url"
                            value={formData.facebookUrl}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, facebookUrl: event.target.value }))
                            }
                            className="input-field"
                            placeholder="https://facebook.com/tu-negocio"
                        />
                    </div>
                    <div>
                        <label htmlFor="register-business-tiktok" className="text-sm font-medium text-gray-700 mb-1 block">
                            TikTok
                        </label>
                        <input
                            id="register-business-tiktok"
                            type="url"
                            value={formData.tiktokUrl}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, tiktokUrl: event.target.value }))
                            }
                            className="input-field"
                            placeholder="https://tiktok.com/@tu-negocio"
                        />
                    </div>
                    <p className="sm:col-span-2 text-xs text-gray-500">
                        Completa al menos WhatsApp, website o email para que la ficha sea util desde el primer dia.
                    </p>
                    <div className="sm:col-span-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <p className="font-medium text-gray-900">Lectura rapida de contacto</p>
                        <p className="mt-1">
                            {formData.whatsapp.trim() || formData.phone.trim() || formData.website.trim() || formData.email.trim()
                                ? 'Ya hay al menos un canal util para convertir desde discovery.'
                                : 'Todavia no hay un canal estructurado visible; eso baja conversion y confianza inicial.'}
                        </p>
                    </div>
                </div>
            );
        }

        if (currentStep === 3) {
            return (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="register-business-address" className="text-sm font-medium text-gray-700 mb-1 block">
                            Dirección *
                        </label>
                        <input
                            id="register-business-address"
                            type="text"
                            value={formData.address}
                            onChange={(event) =>
                                setFormData((previous) => ({ ...previous, address: event.target.value }))
                            }
                            className="input-field"
                            placeholder="Calle, sector, referencia"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="register-business-province" className="text-sm font-medium text-gray-700 mb-1 block">
                                Provincia *
                            </label>
                            <select
                                id="register-business-province"
                                value={formData.provinceId}
                                onChange={(event) =>
                                    setFormData((previous) => ({
                                        ...previous,
                                        provinceId: event.target.value,
                                        cityId: '',
                                        sectorId: '',
                                    }))
                                }
                                className="input-field"
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
                            <label htmlFor="register-business-city" className="text-sm font-medium text-gray-700 mb-1 block">
                                Ciudad
                            </label>
                            <select
                                id="register-business-city"
                                value={formData.cityId}
                                onChange={(event) =>
                                    setFormData((previous) => ({
                                        ...previous,
                                        cityId: event.target.value,
                                        sectorId: '',
                                    }))
                                }
                                className="input-field"
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
                        <div className="sm:col-span-2">
                            <label htmlFor="register-business-sector" className="text-sm font-medium text-gray-700 mb-1 block">
                                Sector o barrio
                            </label>
                            <select
                                id="register-business-sector"
                                value={formData.sectorId}
                                onChange={(event) =>
                                    setFormData((previous) => ({ ...previous, sectorId: event.target.value }))
                                }
                                className="input-field"
                                disabled={!formData.cityId || sectors.length === 0}
                            >
                                <option value="">{formData.cityId ? 'Seleccionar...' : 'Primero elige una ciudad'}</option>
                                {sectors.map((sector) => (
                                    <option key={sector.id} value={sector.id}>
                                        {sector.name}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                                Esta granularidad mejora discovery por zona y resultados cercanos.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-primary-100 bg-primary-50/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-gray-700">
                                Puedes cargar coordenadas automáticas para mejorar la precisión en búsquedas cercanas.
                            </p>
                            <button
                                type="button"
                                onClick={handleUseCurrentLocation}
                                disabled={locating}
                                className="text-xs px-3 py-2 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-100 disabled:opacity-60"
                            >
                                {locating ? 'Obteniendo...' : 'Usar ubicación actual'}
                            </button>
                        </div>
                    </div>

                    <p className="text-xs text-gray-600">
                        {formData.latitude.trim() && formData.longitude.trim()
                            ? `Referencia capturada: ${formData.latitude}, ${formData.longitude}. Se enviará junto con la dirección para mejorar la precisión inicial.`
                            : 'Si no compartes tu ubicación actual, el sistema intentará geocodificar la dirección automáticamente al publicar.'}
                    </p>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        <p className="font-medium text-gray-900">Checklist de ubicacion</p>
                        <p className="mt-1">
                            {formData.address.trim() && formData.provinceId
                                ? 'La base minima para discovery local ya esta lista.'
                                : 'Todavia falta direccion o provincia para una geocodificacion confiable.'}
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Selecciona una o varias categorías *</h3>
                    <div className="flex flex-wrap gap-2">
                        {categoryOptions.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => toggleCategory(category.id)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                    formData.categoryIds.includes(category.id)
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                                }`}
                            >
                                {formatPublicCategoryIcon(category.icon) ? `${formatPublicCategoryIcon(category.icon)} ` : ''}
                                {formatPublicCategoryPath(category.parent?.name, category.name)}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Seleccionadas: {formData.categoryIds.length}
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Servicios / modalidades (opcional)</h3>
                    <div className="flex flex-wrap gap-2">
                        {features.map((feature) => (
                            <button
                                key={feature.id}
                                type="button"
                                onClick={() => toggleFeature(feature.id)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                    formData.featureIds.includes(feature.id)
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                                }`}
                            >
                                {feature.name}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Si marcas "Reservaciones", el negocio mostrara formulario de reserva en su perfil.
                    </p>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Horarios</h3>
                    <p className="mb-3 text-xs text-gray-500">
                        Define horarios reales. Esta información alimenta filtros como "abierto ahora".
                    </p>
                    <Suspense fallback={<RegisterStepSectionFallback rows={7} />}>
                        <BusinessHoursEditor
                            hours={formData.hours}
                            onChange={(hours) => setFormData((previous) => ({ ...previous, hours }))}
                        />
                    </Suspense>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Resumen antes de publicar</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li><strong>Nombre:</strong> {formData.name || 'Sin definir'}</li>
                        <li><strong>Provincia:</strong> {provinces.find((province) => province.id === formData.provinceId)?.name || 'Sin definir'}</li>
                        <li><strong>Ciudad:</strong> {cities.find((city) => city.id === formData.cityId)?.name || 'Sin definir'}</li>
                        <li><strong>Sector:</strong> {sectors.find((sector) => sector.id === formData.sectorId)?.name || 'Sin definir'}</li>
                        <li><strong>Contacto:</strong> {formData.whatsapp || formData.phone || 'Sin definir'}</li>
                        <li><strong>Website:</strong> {formData.website || 'Sin definir'}</li>
                        <li><strong>Precio:</strong> {businessPriceRangeLabel(formData.priceRange) || 'Sin definir'}</li>
                        <li><strong>Reservas:</strong> {features
                            .filter((feature) => formData.featureIds.includes(feature.id))
                            .some((feature) => feature.name.trim().toLowerCase() === BOOKING_FEATURE_CANONICAL)
                            ? 'Habilitadas'
                            : 'No habilitadas'}</li>
                    </ul>
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Imágenes del negocio (opcional)</h3>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleSelectImages}
                        className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-primary-700 hover:file:bg-primary-100"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        Hasta 5 imágenes. Formatos permitidos: JPG, PNG o WEBP (max. 5MB c/u).
                    </p>
                    {selectedImages.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-gray-600">
                            {selectedImages.map((imageFile) => (
                                <li key={`${imageFile.name}-${imageFile.lastModified}`}>
                                    {imageFile.name} ({Math.round(imageFile.size / 1024)} KB)
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="page-shell max-w-5xl space-y-6">
            <section className="role-hero role-hero-owner">
                <p className="text-xs uppercase tracking-[0.16em] text-blue-100 font-semibold">Panel Negocio</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Registra tu negocio</h1>
                <p className="text-blue-100 mt-2 max-w-2xl">
                    Completa 4 pasos para publicar tu negocio con una presentacion clara y confiable.
                </p>
            </section>
            <div className="section-shell p-6 sm:p-8">
                <div className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,340px)]">
                    <div className="rounded-[28px] border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-white p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="chip">Registro guiado</span>
                            <span className="chip">Paso {currentStep} de {TOTAL_REGISTER_STEPS}</span>
                        </div>
                        <h2 className="mt-4 font-display text-3xl font-bold text-slate-900">
                            {currentStepMeta.title}
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 sm:text-base">
                            {currentStepMeta.subtitle}. {currentStepUnlock.detail}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-3 py-2 font-medium">
                                Progreso {progressPercentage}%
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-3 py-2 font-medium">
                                {currentStepActionLabel}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-slate-950/[0.03] p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Salud del onboarding
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Avance
                                </p>
                                <p className="mt-2 font-display text-3xl font-bold text-slate-900">{progressPercentage}%</p>
                            </div>
                            <div className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Checks
                                </p>
                                <p className="mt-2 font-display text-3xl font-bold text-slate-900">{completedVisibilityChecks}</p>
                            </div>
                            <div className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Pendientes
                                </p>
                                <p className="mt-2 font-display text-3xl font-bold text-amber-700">{remainingPublishNeeds.length}</p>
                            </div>
                            <div className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Imagenes
                                </p>
                                <p className="mt-2 font-display text-3xl font-bold text-slate-900">{selectedImages.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="alert-danger mb-6">
                        {error}
                    </div>
                )}

                {loadingData ? (
                    <div className="space-y-6" aria-busy="true">
                        <div className="space-y-3">
                            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full w-1/4 rounded-full bg-primary-200 animate-pulse"></div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {Array.from({ length: TOTAL_REGISTER_STEPS }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                                    >
                                        <div className="h-3 w-16 rounded-full bg-gray-200 animate-pulse"></div>
                                        <div className="mt-2 h-4 w-24 rounded-full bg-gray-200 animate-pulse"></div>
                                        <div className="mt-2 h-3 w-20 rounded-full bg-gray-100 animate-pulse"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 p-5">
                            <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                                <div className="h-3 w-40 rounded-full bg-primary-200 animate-pulse"></div>
                                <div className="mt-3 h-6 w-64 rounded-full bg-white/80 animate-pulse"></div>
                                <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-white/70 animate-pulse"></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className={`rounded-2xl bg-gray-100 animate-pulse ${index === 0 ? 'md:col-span-2 h-24' : 'h-12'}`}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        Navegacion por pasos
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Avanza solo cuando cada bloque tenga la informacion suficiente para discovery y confianza.
                                    </p>
                                </div>
                                <p className="text-sm font-semibold text-primary-700">
                                    {progressPercentage}% completado
                                </p>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-primary-600 to-accent-500 transition-all duration-300"
                                    style={{ width: `${progressPercentage}%` }}
                                />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {REGISTER_STEP_TITLES.map((item) => (
                                    <button
                                        key={item.step}
                                        type="button"
                                        onClick={() => goToStep(item.step)}
                                        className={`rounded-xl border px-3 py-2 text-left transition ${
                                            currentStep === item.step
                                                ? 'border-primary-500 bg-primary-50'
                                                : item.step < currentStep
                                                    ? 'border-gray-300 bg-white hover:border-primary-300'
                                                    : 'border-gray-200 bg-gray-50'
                                        }`}
                                    >
                                        <p className="text-xs font-semibold text-gray-700">Paso {item.step}</p>
                                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                                        <p className="text-[11px] text-gray-500">{item.subtitle}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 p-5">
                            <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Lo que desbloqueas en este paso</p>
                                <h2 className="mt-1 text-lg font-semibold text-gray-900">{currentStepUnlock.title}</h2>
                                <p className="mt-1 text-sm text-gray-600">{currentStepUnlock.detail}</p>
                            </div>
                            {renderStepBody()}
                        </div>

                        <Suspense fallback={<RegisterStepSectionFallback rows={5} />}>
                            <PublicationGuidancePanel
                                submissionGuidance={submissionGuidance}
                                currentStepTips={currentStepTips}
                                completedVisibilityChecks={completedVisibilityChecks}
                                remainingPublishNeeds={remainingPublishNeeds}
                            />
                        </Suspense>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <button
                                type="button"
                                onClick={handlePreviousStep}
                                disabled={currentStep === 1 || loading}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                    Paso {currentStep} de {TOTAL_REGISTER_STEPS}
                                </span>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary min-w-[220px]"
                                >
                                    <BusyButtonLabel busy={loading} busyText="Registrando..." idleText={currentStepActionLabel} />
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
