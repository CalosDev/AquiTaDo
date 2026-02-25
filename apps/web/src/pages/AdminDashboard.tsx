import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/error';
import { analyticsApi, businessApi, categoryApi, reviewApi, verificationApi } from '../api/endpoints';

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

interface PendingVerificationBusiness {
    id: string;
    name: string;
    slug: string;
    riskScore: number;
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'UNVERIFIED';
    verificationSubmittedAt?: string | null;
    verificationNotes?: string | null;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    documents: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
    };
}

interface MarketReport {
    id: string;
    reportType: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK';
    generatedAt: string;
    generatedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface FlaggedReview {
    id: string;
    rating: number;
    comment?: string | null;
    moderationReason?: string | null;
    flaggedAt?: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
    };
    business: {
        id: string;
        name: string;
    };
}

type CategoryForm = {
    name: string;
    slug: string;
    icon: string;
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
    name: '',
    slug: '',
    icon: '',
};

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

export function AdminDashboard() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeTab, setActiveTab] = useState<'businesses' | 'categories' | 'verification'>('businesses');
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [pendingVerifications, setPendingVerifications] = useState<PendingVerificationBusiness[]>([]);
    const [marketReports, setMarketReports] = useState<MarketReport[]>([]);
    const [flaggedReviews, setFlaggedReviews] = useState<FlaggedReview[]>([]);
    const [generatingReport, setGeneratingReport] = useState(false);

    const [newCategoryForm, setNewCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);

    const loadData = useCallback(async () => {
        setErrorMessage('');

        try {
            const [businessesResponse, categoriesResponse] = await Promise.all([
                businessApi.getAllAdmin({ limit: 100 }),
                categoryApi.getAll(),
            ]);
            setBusinesses(businessesResponse.data.data || []);
            setCategories(categoriesResponse.data);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el panel admin'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const loadVerificationData = useCallback(async () => {
        setVerificationLoading(true);
        try {
            const [pendingRes, reportsRes, flaggedReviewsRes] = await Promise.all([
                verificationApi.getPendingBusinessesAdmin({ limit: 50 }),
                analyticsApi.listMarketReports({ limit: 20 }),
                reviewApi.getFlagged({ limit: 50 }),
            ]);
            setPendingVerifications((pendingRes.data || []) as PendingVerificationBusiness[]);
            setMarketReports((reportsRes.data || []) as MarketReport[]);
            setFlaggedReviews((flaggedReviewsRes.data || []) as FlaggedReview[]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar verificación y data layer'));
        } finally {
            setVerificationLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'verification') {
            void loadVerificationData();
        }
    }, [activeTab, loadVerificationData]);

    const handleVerifyBusiness = async (businessId: string) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.verify(businessId);
            await loadData();
            setSuccessMessage('Negocio aprobado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo aprobar el negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeleteBusiness = async (businessId: string) => {
        if (!window.confirm('Seguro que deseas eliminar este negocio?')) {
            return;
        }

        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.delete(businessId);
            await loadData();
            setSuccessMessage('Negocio eliminado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar el negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleCreateCategory = async (event: React.FormEvent) => {
        event.preventDefault();

        const slug = newCategoryForm.slug.trim() || toSlug(newCategoryForm.name);
        if (!newCategoryForm.name.trim() || !slug) {
            setErrorMessage('Nombre y slug son obligatorios');
            return;
        }

        setProcessingId('create-category');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.create({
                name: newCategoryForm.name.trim(),
                slug,
                icon: newCategoryForm.icon.trim() || undefined,
            });
            setNewCategoryForm(EMPTY_CATEGORY_FORM);
            await loadData();
            setSuccessMessage('Categoría creada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la categoría'));
        } finally {
            setProcessingId(null);
        }
    };

    const startCategoryEdit = (category: Category) => {
        setEditingCategoryId(category.id);
        setEditingCategoryForm({
            name: category.name,
            slug: category.slug,
            icon: category.icon || '',
        });
        setErrorMessage('');
        setSuccessMessage('');
    };

    const cancelCategoryEdit = () => {
        setEditingCategoryId(null);
        setEditingCategoryForm(EMPTY_CATEGORY_FORM);
    };

    const saveCategoryEdit = async (categoryId: string) => {
        if (!editingCategoryForm.name.trim() || !editingCategoryForm.slug.trim()) {
            setErrorMessage('Nombre y slug son obligatorios');
            return;
        }

        setProcessingId(categoryId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.update(categoryId, {
                name: editingCategoryForm.name.trim(),
                slug: toSlug(editingCategoryForm.slug.trim()),
                icon: editingCategoryForm.icon.trim() || undefined,
            });
            await loadData();
            cancelCategoryEdit();
            setSuccessMessage('Categoría actualizada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la categoría'));
        } finally {
            setProcessingId(null);
        }
    };

    const deleteCategory = async (categoryId: string) => {
        if (!window.confirm('Seguro que deseas eliminar esta categoría?')) {
            return;
        }

        setProcessingId(categoryId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.delete(categoryId);
            await loadData();
            if (editingCategoryId === categoryId) {
                cancelCategoryEdit();
            }
            setSuccessMessage('Categoría eliminada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la categoría'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleReviewVerification = async (
        businessId: string,
        status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED',
    ) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.reviewBusinessAdmin(businessId, {
                status,
                notes: status === 'VERIFIED'
                    ? 'Verificación aprobada por equipo admin'
                    : 'Revisión administrativa',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage('Revisión de verificación actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la verificación'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleGenerateMarketReport = async (
        reportType: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK',
    ) => {
        setGeneratingReport(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await analyticsApi.generateMarketReport({
                reportType,
                days: 30,
            });
            await loadVerificationData();
            setSuccessMessage('Reporte de mercado generado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo generar el reporte'));
        } finally {
            setGeneratingReport(false);
        }
    };

    const handleModerateFlaggedReview = async (
        reviewId: string,
        status: 'APPROVED' | 'FLAGGED',
    ) => {
        setProcessingId(reviewId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await reviewApi.moderate(reviewId, {
                status,
                reason: status === 'APPROVED'
                    ? 'Aprobada por equipo de moderacion'
                    : 'Mantenida en cola por riesgo',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Resena aprobada y publicada'
                    : 'Resena mantenida como sospechosa',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la resena'));
        } finally {
            setProcessingId(null);
        }
    };

    const tabs = [
        { key: 'businesses', label: 'Negocios', icon: '🏪' },
        { key: 'categories', label: 'Categorías', icon: '📁' },
        { key: 'verification', label: 'KYC + Data Layer', icon: '🛡️' },
    ] as const;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">Panel Admin</h1>
            <p className="text-gray-500 mb-8">Gestión de negocios y categorías</p>

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
                        {businesses.filter((business) => business.verified).length}
                    </div>
                    <div className="text-xs text-gray-500">Verificados</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                        {businesses.filter((business) => !business.verified).length}
                    </div>
                    <div className="text-xs text-gray-500">Pendientes</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-accent-600">{categories.length}</div>
                    <div className="text-xs text-gray-500">Categorías</div>
                </div>
            </div>

            <div className="flex gap-2 mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            activeTab === tab.key
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
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Negocio
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Propietario
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Estado
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Fecha
                                            </th>
                                            <th className="text-right text-xs font-semibold text-gray-500 uppercase p-4">
                                                Acciones
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {businesses.map((business) => (
                                            <tr key={business.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-medium text-gray-900">{business.name}</td>
                                                <td className="p-4 text-sm text-gray-500">
                                                    {business.owner?.name || '-'}
                                                </td>
                                                <td className="p-4">
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            business.verified
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}
                                                    >
                                                        {business.verified ? 'Verificado' : 'Pendiente'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-gray-400">
                                                    {new Date(business.createdAt).toLocaleDateString('es-DO')}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {!business.verified && (
                                                            <button
                                                                onClick={() =>
                                                                    void handleVerifyBusiness(business.id)
                                                                }
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                {processingId === business.id
                                                                    ? 'Procesando...'
                                                                    : 'Aprobar'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() =>
                                                                void handleDeleteBusiness(business.id)
                                                            }
                                                            disabled={processingId === business.id}
                                                            className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                        >
                                                            {processingId === business.id
                                                                ? 'Procesando...'
                                                                : 'Eliminar'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {businesses.length === 0 && (
                                <div className="p-10 text-center text-gray-400">
                                    No hay negocios registrados
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'categories' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Crear categoría</h3>
                                <form onSubmit={handleCreateCategory} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="Nombre"
                                        value={newCategoryForm.name}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                name: event.target.value,
                                                slug:
                                                    prev.slug.trim().length > 0
                                                        ? prev.slug
                                                        : toSlug(event.target.value),
                                            }))
                                        }
                                    />
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="slug"
                                        value={newCategoryForm.slug}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                slug: toSlug(event.target.value),
                                            }))
                                        }
                                    />
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="Icono (opcional)"
                                        value={newCategoryForm.icon}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                icon: event.target.value,
                                            }))
                                        }
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={processingId === 'create-category'}
                                    >
                                        {processingId === 'create-category' ? 'Creando...' : 'Crear'}
                                    </button>
                                </form>
                            </div>

                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Categorías actuales</h3>
                                <div className="space-y-3">
                                    {categories.map((category) => (
                                        <div
                                            key={category.id}
                                            className="p-3 rounded-xl border border-gray-100 bg-gray-50"
                                        >
                                            {editingCategoryId === category.id ? (
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.name}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                name: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.slug}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                slug: toSlug(event.target.value),
                                                            }))
                                                        }
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.icon}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                icon: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn-primary text-xs"
                                                            onClick={() =>
                                                                void saveCategoryEdit(category.id)
                                                            }
                                                            disabled={processingId === category.id}
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn-secondary text-xs"
                                                            onClick={cancelCategoryEdit}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span>{category.icon || '📁'}</span>
                                                        <span className="font-medium text-gray-800">
                                                            {category.name}
                                                        </span>
                                                        <span className="text-gray-400">({category.slug})</span>
                                                        <span className="text-xs text-gray-500">
                                                            {category._count?.businesses || 0} negocios
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn-secondary text-xs"
                                                            onClick={() => startCategoryEdit(category)}
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                            onClick={() => void deleteCategory(category.id)}
                                                            disabled={processingId === category.id}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'verification' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Verificación KYC pendiente</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => void loadVerificationData()}
                                        disabled={verificationLoading}
                                    >
                                        {verificationLoading ? 'Actualizando...' : 'Actualizar'}
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {pendingVerifications.length > 0 ? pendingVerifications.map((business) => (
                                        <div key={business.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="font-medium text-gray-900">{business.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {business.organization.name} · riesgo {business.riskScore}/100 · docs {business.documents.total}
                                                    </p>
                                                </div>
                                                <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-700">
                                                    {business.verificationStatus}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Pendientes {business.documents.pending} · Aprobados {business.documents.approved} · Rechazados {business.documents.rejected}
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    className="btn-primary text-xs"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'VERIFIED')
                                                    }
                                                >
                                                    Aprobar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary text-xs"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'REJECTED')
                                                    }
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'SUSPENDED')
                                                    }
                                                >
                                                    Suspender
                                                </button>
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay verificaciones pendientes.</p>
                                    )}
                                </div>
                            </div>

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Moderacion automatica: resenas sospechosas</h3>
                                    <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                                        {flaggedReviews.length} en cola
                                    </span>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {flaggedReviews.length > 0 ? flaggedReviews.map((review) => (
                                        <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="font-medium text-gray-900">
                                                        {review.business.name} · {review.user.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Rating {review.rating}/5 · {new Date(review.flaggedAt || review.createdAt).toLocaleString('es-DO')}
                                                    </p>
                                                </div>
                                                <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-700">
                                                    FLAGGED
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                                                {review.comment?.trim() || '(Sin comentario)'}
                                            </p>
                                            {review.moderationReason ? (
                                                <p className="text-xs text-red-700 mt-1">{review.moderationReason}</p>
                                            ) : null}
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    className="btn-primary text-xs"
                                                    disabled={processingId === review.id}
                                                    onClick={() => void handleModerateFlaggedReview(review.id, 'APPROVED')}
                                                >
                                                    Aprobar y publicar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary text-xs"
                                                    disabled={processingId === review.id}
                                                    onClick={() => void handleModerateFlaggedReview(review.id, 'FLAGGED')}
                                                >
                                                    Mantener en cola
                                                </button>
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay resenas sospechosas en este momento.</p>
                                    )}
                                </div>
                            </div>

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Data Layer: snapshots</h3>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('PROVINCE_CATEGORY_DEMAND')
                                            }
                                        >
                                            Demanda
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('TRENDING_BUSINESSES')
                                            }
                                        >
                                            Tendencias
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('CONVERSION_BENCHMARK')
                                            }
                                        >
                                            Benchmark
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {marketReports.length > 0 ? marketReports.map((report) => (
                                        <div key={report.id} className="rounded-xl border border-gray-100 p-3">
                                            <p className="text-sm font-medium text-gray-900">{report.reportType}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(report.generatedAt).toLocaleString('es-DO')} · {report.generatedByUser?.name || 'Sistema'}
                                            </p>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">Sin snapshots generados.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
