import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiErrorMessage } from '../../api/error';
import { paymentsApi, plansApi, subscriptionsApi } from '../../api/endpoints';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import {
    BillingSummaryCard,
    InvoiceTable,
    KPIHeader,
    NextStepCard,
    PageShell,
    PartialDataState,
    PlanStatusCard,
    TrendPanel,
} from '../../components/ui';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import { formatCurrencyDo, formatDateDo, formatDateTimeDo, formatNumberDo } from '../../lib/market';

type PlanCode = 'FREE' | 'GROWTH' | 'SCALE';
type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'UNPAID';
type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | string;
type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE' | string;
type TopupStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | string;

interface PlanSnapshot {
    id: string;
    code: PlanCode;
    name: string;
    description?: string | null;
    priceMonthly: string | number;
    currency: string;
    transactionFeeBps: number;
    maxBusinesses: number | null;
    maxMembers: number | null;
    maxImagesPerBusiness: number | null;
    maxPromotions: number | null;
    analyticsRetentionDays: number | null;
}

interface SubscriptionSnapshot {
    id: string;
    organizationId: string;
    status: SubscriptionStatus;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt?: string | null;
    createdAt: string;
    updatedAt: string;
    plan: PlanSnapshot;
}

interface BillingSummarySnapshot {
    range: {
        from: string | null;
        to: string | null;
    };
    invoices: {
        byStatus: Record<string, { count: number; total: number }>;
        subtotal: number;
        tax: number;
        total: number;
    };
    payments: {
        byStatus: Record<string, { count: number; total: number }>;
        totalCollected: number;
        totalFailed: number;
    };
    marketplace: {
        successfulTransactions: number;
        grossAmount: number;
        platformFeeAmount: number;
        netAmount: number;
    };
}

interface FiscalMonthSnapshot {
    period: string;
    invoicesIssued: number;
    invoicesPaid: number;
    subtotal: number;
    tax: number;
    total: number;
    paidTotal: number;
}

interface FiscalSummarySnapshot {
    range: {
        from: string | null;
        to: string | null;
    };
    totals: {
        invoicesIssued: number;
        invoicesPaid: number;
        subtotal: number;
        tax: number;
        total: number;
        paidTotal: number;
        pendingTotal: number;
    };
    monthly: FiscalMonthSnapshot[];
}

interface PaymentSnapshot {
    id: string;
    provider: string;
    amount: string | number;
    currency: string;
    status: PaymentStatus;
    createdAt: string;
    paidAt?: string | null;
    failureReason?: string | null;
}

interface InvoiceSnapshot {
    id: string;
    number?: string | null;
    status: InvoiceStatus;
    issuedAt: string;
    dueAt?: string | null;
    paidAt?: string | null;
    currency: string;
    amountSubtotal: string | number;
    amountTax: string | number;
    amountTotal: string | number;
    pdfUrl?: string | null;
}

interface WalletTopupSnapshot {
    id: string;
    amount: string | number;
    currency: string;
    status: TopupStatus;
    createdAt: string;
    paidAt?: string | null;
    failureReason?: string | null;
}

interface AdsWalletSnapshot {
    organizationId: string;
    balance: string | number;
    topups: WalletTopupSnapshot[];
}

interface BillingWorkspaceProps {
    activeOrganizationId: string | null;
    organizationName?: string | null;
}

interface BillingDateRange {
    from: string;
    to: string;
}

function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
        return (value as { data: T[] }).data;
    }
    return [];
}

function normalizePlanCode(code?: string | null): PlanCode | null {
    if (code === 'FREE' || code === 'GROWTH' || code === 'SCALE') {
        return code;
    }
    return null;
}

function resolveInitialDateRange(): BillingDateRange {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 89);
    return {
        from: from.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
    };
}

function getSubscriptionTone(status: SubscriptionStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'bg-primary-100 text-primary-700';
        case 'PAST_DUE':
            return 'bg-amber-100 text-amber-800';
        case 'CANCELED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-red-100 text-red-700';
    }
}

function getSubscriptionLabel(status: SubscriptionStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'Activa';
        case 'PAST_DUE':
            return 'Pago pendiente';
        case 'CANCELED':
            return 'Cancelada';
        case 'INCOMPLETE':
            return 'Incompleta';
        case 'UNPAID':
            return 'Sin pagar';
        default:
            return status;
    }
}

function getPaymentTone(status: string): string {
    switch (status) {
        case 'SUCCEEDED':
        case 'PAID':
            return 'bg-primary-100 text-primary-700';
        case 'PENDING':
        case 'OPEN':
        case 'DRAFT':
            return 'bg-amber-100 text-amber-800';
        case 'CANCELED':
        case 'VOID':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-red-100 text-red-700';
    }
}

function getPaymentLabel(status: string): string {
    switch (status) {
        case 'SUCCEEDED':
            return 'Cobrado';
        case 'PENDING':
            return 'Pendiente';
        case 'FAILED':
            return 'Fallido';
        case 'CANCELED':
            return 'Cancelado';
        case 'OPEN':
            return 'Abierta';
        case 'DRAFT':
            return 'Borrador';
        case 'PAID':
            return 'Pagada';
        case 'VOID':
            return 'Anulada';
        case 'UNCOLLECTIBLE':
            return 'Incobrable';
        default:
            return status;
    }
}

function formatCapabilityLimit(value: number | null, suffix: string): string {
    if (value === null) {
        return `Ilimitado ${suffix}`;
    }
    return `${formatNumberDo(value)} ${suffix}`;
}

function buildReturnUrl(): string {
    if (typeof window === 'undefined') {
        return 'http://localhost:5173/dashboard';
    }

    const url = new URL(window.location.href);
    url.hash = '';
    return url.toString();
}

function downloadBlob(blob: Blob, fileName: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}

function resolveExportFileName(
    headers: Record<string, string | undefined>,
    fallback: string,
): string {
    const disposition = headers['content-disposition'] || headers['Content-Disposition'];
    if (!disposition) {
        return fallback;
    }

    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
}

export function BillingWorkspace({
    activeOrganizationId,
    organizationName,
}: BillingWorkspaceProps) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionKey, setActionKey] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [dateRange, setDateRange] = useState<BillingDateRange>(resolveInitialDateRange);
    const [topupAmount, setTopupAmount] = useState('2500');
    const [plans, setPlans] = useState<PlanSnapshot[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
    const [billingSummary, setBillingSummary] = useState<BillingSummarySnapshot | null>(null);
    const [fiscalSummary, setFiscalSummary] = useState<FiscalSummarySnapshot | null>(null);
    const [payments, setPayments] = useState<PaymentSnapshot[]>([]);
    const [invoices, setInvoices] = useState<InvoiceSnapshot[]>([]);
    const [adsWallet, setAdsWallet] = useState<AdsWalletSnapshot | null>(null);

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const loadBillingData = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeOrganizationId) {
            setPlans([]);
            setSubscription(null);
            setBillingSummary(null);
            setFiscalSummary(null);
            setPayments([]);
            setInvoices([]);
            setAdsWallet(null);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (options?.silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const params = {
                from: dateRange.from || undefined,
                to: dateRange.to || undefined,
            };

            const [
                plansResponse,
                subscriptionResponse,
                billingSummaryResponse,
                fiscalSummaryResponse,
                paymentsResponse,
                invoicesResponse,
                adsWalletResponse,
            ] = await Promise.all([
                plansApi.getAll(),
                subscriptionsApi.getCurrent(),
                paymentsApi.getBillingSummary(params),
                paymentsApi.getFiscalSummary(params),
                paymentsApi.getMyPayments({ limit: 8 }),
                paymentsApi.getMyInvoices({ limit: 8 }),
                paymentsApi.getAdsWalletOverview({ limit: 6 }),
            ]);

            setPlans(asArray<PlanSnapshot>(plansResponse.data));
            setSubscription((subscriptionResponse.data || null) as SubscriptionSnapshot | null);
            setBillingSummary((billingSummaryResponse.data || null) as BillingSummarySnapshot | null);
            setFiscalSummary((fiscalSummaryResponse.data || null) as FiscalSummarySnapshot | null);
            setPayments(asArray<PaymentSnapshot>(paymentsResponse.data));
            setInvoices(asArray<InvoiceSnapshot>(invoicesResponse.data));
            setAdsWallet((adsWalletResponse.data || null) as AdsWalletSnapshot | null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la facturacion de la organizacion'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeOrganizationId, dateRange.from, dateRange.to]);

    useEffect(() => {
        void loadBillingData();
    }, [loadBillingData]);

    const currentPlanCode = normalizePlanCode(subscription?.plan.code);
    const paidPlans = useMemo(
        () => plans.filter((plan) => Number(plan.priceMonthly) > 0),
        [plans],
    );
    const fiscalPreview = useMemo(
        () => (fiscalSummary?.monthly ?? []).slice(-6).reverse(),
        [fiscalSummary],
    );

    const handleCheckoutPlan = async (planCode: PlanCode) => {
        setActionKey(`plan:${planCode}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const returnUrl = buildReturnUrl();
            const response = await subscriptionsApi.createCheckoutSession({
                planCode,
                successUrl: returnUrl,
                cancelUrl: returnUrl,
            });

            const payload = (response.data || {}) as { checkoutUrl?: string | null };
            if (payload.checkoutUrl && typeof window !== 'undefined') {
                window.location.assign(payload.checkoutUrl);
                return;
            }

            setSuccessMessage('Sesion de pago creada. Puedes refrescar el panel para confirmar el cambio.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar el checkout del plan'));
        } finally {
            setActionKey('');
        }
    };

    const handleCancelAtPeriodEnd = async () => {
        setActionKey('cancel-subscription');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await subscriptionsApi.cancelAtPeriodEnd();
            setSuccessMessage('La suscripcion quedo programada para finalizar al cierre del periodo actual');
            await loadBillingData({ silent: true });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo programar la cancelacion'));
        } finally {
            setActionKey('');
        }
    };

    const handleTopupCheckout = async () => {
        const parsedAmount = Number(topupAmount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
            setErrorMessage('Ingresa un monto valido para la recarga del wallet');
            return;
        }

        setActionKey('ads-topup');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const returnUrl = buildReturnUrl();
            const response = await paymentsApi.createAdsWalletCheckoutSession({
                amount: parsedAmount,
                successUrl: returnUrl,
                cancelUrl: returnUrl,
            });

            const payload = (response.data || {}) as { checkoutUrl?: string | null };
            if (payload.checkoutUrl && typeof window !== 'undefined') {
                window.location.assign(payload.checkoutUrl);
                return;
            }

            setSuccessMessage('Sesion de recarga creada. Actualiza el panel despues de completar el pago.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar la recarga del wallet'));
        } finally {
            setActionKey('');
        }
    };

    const handleExportCsv = async (kind: 'invoices' | 'payments' | 'fiscal') => {
        setActionKey(`export:${kind}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const params = {
                from: dateRange.from || undefined,
                to: dateRange.to || undefined,
            };
            const response = kind === 'invoices'
                ? await paymentsApi.exportInvoicesCsv(params)
                : kind === 'payments'
                    ? await paymentsApi.exportPaymentsCsv(params)
                    : await paymentsApi.exportFiscalCsv(params);

            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
            const fileName = resolveExportFileName(
                response.headers as Record<string, string | undefined>,
                `${kind}.csv`,
            );
            downloadBlob(blob, fileName);
            setSuccessMessage('CSV descargado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo descargar el archivo CSV'));
        } finally {
            setActionKey('');
        }
    };

    if (loading) {
        return (
            <PageShell className="p-6 space-y-5" width="full">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                        <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-8 w-56 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                    <div className="h-9 w-32 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <div className="h-3 w-20 rounded-full bg-slate-100 animate-pulse" />
                            <div className="mt-3 h-7 w-24 rounded-full bg-slate-100 animate-pulse" />
                            <div className="mt-2 h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="h-5 w-32 rounded-full bg-slate-100 animate-pulse" />
                            <div className="mt-4 h-24 rounded-2xl bg-slate-50 animate-pulse" />
                        </div>
                    ))}
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell className="p-6 space-y-6" width="full">
            <PageFeedbackStack
                items={[
                    { id: 'billing-error', tone: 'danger', text: errorMessage },
                    { id: 'billing-success', tone: 'success', text: successMessage },
                ]}
            />

            <KPIHeader
                eyebrow="Planes y pagos"
                title="Plan, cobros y saldo para campanas"
                description={organizationName
                    ? `Controla el plan activo, los cobros y el saldo disponible de ${organizationName}.`
                    : 'Controla el plan activo, los cobros y el saldo disponible de tu organizacion.'}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={() => void loadBillingData({ silent: true })}
                            disabled={refreshing}
                        >
                            {refreshing ? 'Actualizando...' : 'Actualizar panel'}
                        </button>
                        {subscription && currentPlanCode !== 'FREE' && !subscription.cancelAtPeriodEnd ? (
                            <button
                                type="button"
                                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleCancelAtPeriodEnd()}
                                disabled={actionKey === 'cancel-subscription'}
                            >
                                {actionKey === 'cancel-subscription' ? 'Procesando...' : 'Cancelar al final del periodo'}
                            </button>
                        ) : null}
                    </div>
                )}
                metrics={[
                    {
                        label: 'Plan',
                        value: subscription?.plan.name || 'N/D',
                        delta: subscription ? `${formatCurrencyDo(subscription.plan.priceMonthly, subscription.plan.currency)}/mes` : 'Sin suscripcion',
                    },
                    {
                        label: 'Saldo para anuncios',
                        value: formatCurrencyDo(adsWallet?.balance ?? 0, 'DOP'),
                        delta: 'Disponible para promocionar tu negocio',
                    },
                    {
                        label: 'Cobrado',
                        value: formatCurrencyDo(billingSummary?.payments.totalCollected ?? 0, 'DOP'),
                        delta: 'Pagos exitosos en el rango',
                    },
                    {
                        label: 'Facturado',
                        value: formatCurrencyDo(billingSummary?.invoices.total ?? 0, 'DOP'),
                        delta: 'Total de facturas emitidas en el rango',
                    },
                    {
                        label: 'Neto recibido',
                        value: formatCurrencyDo(billingSummary?.marketplace.netAmount ?? 0, 'DOP'),
                        delta: `Comision ${formatCurrencyDo(billingSummary?.marketplace.platformFeeAmount ?? 0, 'DOP')}`,
                    },
                    {
                        label: 'Pendiente fiscal',
                        value: formatCurrencyDo(fiscalSummary?.totals.pendingTotal ?? 0, 'DOP'),
                        delta: `${fiscalSummary?.totals.invoicesIssued ?? 0} facturas emitidas`,
                    },
                ]}
            />

            <div className="flex flex-wrap gap-2.5">
                <span className="chip">Plan actual: {subscription?.plan.name || 'Sin plan'}</span>
                {subscription ? (
                    <span className={`chip ${getSubscriptionTone(subscription.status)}`}>
                        Suscripcion: {getSubscriptionLabel(subscription.status)}
                    </span>
                ) : null}
                {subscription?.currentPeriodEnd ? (
                    <span className="chip">Periodo vigente hasta: {formatDateDo(subscription.currentPeriodEnd)}</span>
                ) : null}
                {subscription?.cancelAtPeriodEnd ? (
                    <span className="chip bg-amber-100 text-amber-800">Se cancela al cierre del periodo</span>
                ) : null}
            </div>

            {refreshing ? (
                <PartialDataState
                    compact
                    title="Actualizando panel"
                    body="Seguimos refrescando plan, saldo y resumen financiero sin perder el contexto actual."
                />
            ) : null}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {plans.map((plan) => {
                            const isCurrent = plan.code === currentPlanCode;
                            const isPaidPlan = Number(plan.priceMonthly) > 0;
                            const canCheckout = isPaidPlan && !isCurrent;

                            return (
                                <PlanStatusCard
                                    key={plan.id}
                                    code={plan.code}
                                    name={plan.name}
                                    price={formatCurrencyDo(plan.priceMonthly, plan.currency)}
                                    priceSuffix="/ mes"
                                    description={plan.description || 'Sin descripcion.'}
                                    badge={isCurrent ? (
                                        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">
                                            Plan actual
                                        </span>
                                    ) : undefined}
                                    features={[
                                        formatCapabilityLimit(plan.maxBusinesses, 'negocios'),
                                        formatCapabilityLimit(plan.maxMembers, 'miembros'),
                                        formatCapabilityLimit(plan.maxImagesPerBusiness, 'imagenes por ficha'),
                                        formatCapabilityLimit(plan.maxPromotions, 'promociones'),
                                        `Analitica disponible: ${plan.analyticsRetentionDays === null
                                            ? 'Ilimitada'
                                            : `${formatNumberDo(plan.analyticsRetentionDays)} dias`}`,
                                        `Comision por transaccion: ${(plan.transactionFeeBps / 100).toFixed(2)}%`,
                                    ]}
                                    footer={isCurrent ? (
                                        <p className="rounded-2xl border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                                            Este es el plan que hoy usa tu organizacion.
                                        </p>
                                    ) : !canCheckout ? (
                                        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                            Si mas adelante quieres bajar desde un plan pago, programa la cancelacion al cierre del periodo.
                                        </p>
                                    ) : undefined}
                                    action={canCheckout ? (
                                        <button
                                            type="button"
                                            className="btn-primary w-full text-sm"
                                            onClick={() => void handleCheckoutPlan(plan.code)}
                                            disabled={actionKey === `plan:${plan.code}`}
                                        >
                                            {actionKey === `plan:${plan.code}` ? 'Abriendo checkout...' : `Cambiar a ${plan.name}`}
                                        </button>
                                    ) : undefined}
                                />
                            );
                        })}
                    </div>
                    {paidPlans.length === 0 ? (
                        <p className="text-sm text-slate-500">Todavia no hay planes pagos disponibles para esta organizacion.</p>
                    ) : null}
                </div>

                <div className="space-y-5">
                    <NextStepCard
                        title="Saldo para anuncios"
                        body={(
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Saldo disponible</p>
                                    <p className="mt-2 text-3xl font-bold text-slate-900">
                                        {formatCurrencyDo(adsWallet?.balance ?? 0, 'DOP')}
                                    </p>
                                </div>
                                <label className="block text-sm font-medium text-slate-800" htmlFor="ads-topup-amount">
                                    Recarga rapida
                                </label>
                                <input
                                    id="ads-topup-amount"
                                    className="input-field"
                                    inputMode="decimal"
                                    value={topupAmount}
                                    onChange={(event) => setTopupAmount(event.target.value)}
                                    placeholder="2500"
                                />
                            </div>
                        )}
                        action={(
                            <button
                                type="button"
                                className="btn-secondary w-full text-sm"
                                onClick={() => void handleTopupCheckout()}
                                disabled={actionKey === 'ads-topup'}
                            >
                                {actionKey === 'ads-topup' ? 'Abriendo checkout...' : 'Recargar saldo'}
                            </button>
                        )}
                    />

                    <InvoiceTable
                        title="Recargas recientes"
                        description="Resumen corto del saldo que has recargado para promocionar tu negocio."
                        items={(adsWallet?.topups ?? []).map((topup) => ({
                            id: topup.id,
                            title: formatCurrencyDo(topup.amount, topup.currency),
                            meta: formatDateTimeDo(topup.createdAt),
                            statusLabel: getPaymentLabel(topup.status),
                            statusClassName: getPaymentTone(topup.status),
                            amount: formatCurrencyDo(topup.amount, topup.currency),
                            detail: topup.failureReason || 'Recarga procesada para el saldo publicitario.',
                        }))}
                        emptyTitle="Sin recargas registradas"
                        emptyBody="Cuando la organizacion recargue saldo para anuncios, veras aqui el historial del wallet."
                    />
                </div>
            </div>

            <div className="space-y-5">
                <div className="card-filter density-compact">
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="date"
                            className="input-field min-w-[10.5rem]"
                            value={dateRange.from}
                            onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                        />
                        <input
                            type="date"
                            className="input-field min-w-[10.5rem]"
                            value={dateRange.to}
                            onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                        />
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={() => void loadBillingData({ silent: true })}
                            disabled={refreshing}
                        >
                            Aplicar rango
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <BillingSummaryCard label="Facturas emitidas" value={fiscalSummary?.totals.invoicesIssued ?? 0} />
                            <BillingSummaryCard label="Facturas pagadas" value={fiscalSummary?.totals.invoicesPaid ?? 0} />
                            <BillingSummaryCard label="Pagado" value={formatCurrencyDo(fiscalSummary?.totals.paidTotal ?? 0, 'DOP')} />
                            <BillingSummaryCard label="Pendiente" value={formatCurrencyDo(fiscalSummary?.totals.pendingTotal ?? 0, 'DOP')} />
                        </div>

                        <TrendPanel
                            title="Cierre mensual"
                            description="Revisa el pulso fiscal sin salir del panel."
                            actions={(
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void handleExportCsv('invoices')}
                                        disabled={actionKey === 'export:invoices'}
                                    >
                                        {actionKey === 'export:invoices' ? 'Descargando...' : 'Descargar facturas'}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void handleExportCsv('payments')}
                                        disabled={actionKey === 'export:payments'}
                                    >
                                        {actionKey === 'export:payments' ? 'Descargando...' : 'Descargar pagos'}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        onClick={() => void handleExportCsv('fiscal')}
                                        disabled={actionKey === 'export:fiscal'}
                                    >
                                        {actionKey === 'export:fiscal' ? 'Descargando...' : 'Descargar resumen'}
                                    </button>
                                </div>
                            )}
                            rows={fiscalPreview.map((row) => ({
                                id: row.period,
                                label: row.period,
                                meta: `Emitidas ${row.invoicesIssued} | Pagadas ${row.invoicesPaid}`,
                                value: formatCurrencyDo(row.total, 'DOP'),
                                detail: `Cobrado ${formatCurrencyDo(row.paidTotal, 'DOP')}`,
                            }))}
                            emptyTitle="Sin movimientos fiscales"
                            emptyBody="Ajusta el rango para revisar cierres mensuales cuando haya actividad contable."
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-5">
                        <InvoiceTable
                            title="Pagos recientes"
                            description="Cobros e intentos de pago mas recientes."
                            items={payments.map((payment) => ({
                                id: payment.id,
                                title: formatCurrencyDo(payment.amount, payment.currency),
                                meta: `${payment.provider} | ${formatDateTimeDo(payment.createdAt)}`,
                                statusLabel: getPaymentLabel(payment.status),
                                statusClassName: getPaymentTone(payment.status),
                                amount: formatCurrencyDo(payment.amount, payment.currency),
                                detail: payment.failureReason || 'Movimiento registrado correctamente.',
                            }))}
                            emptyTitle="Sin pagos registrados"
                            emptyBody="Cuando entren cobros o intentos de pago, apareceran aqui con su estado."
                        />

                        <InvoiceTable
                            title="Facturas recientes"
                            description="Documentos emitidos y acceso rapido al PDF."
                            items={invoices.map((invoice) => ({
                                id: invoice.id,
                                title: invoice.number || invoice.id.slice(0, 8),
                                meta: `Emitida ${formatDateTimeDo(invoice.issuedAt)}`,
                                statusLabel: getPaymentLabel(invoice.status),
                                statusClassName: getPaymentTone(invoice.status),
                                amount: `Total ${formatCurrencyDo(invoice.amountTotal, invoice.currency)}`,
                                detail: (
                                    <div className="flex flex-wrap gap-3">
                                        {invoice.dueAt ? <span>Vence {formatDateDo(invoice.dueAt)}</span> : null}
                                        {invoice.paidAt ? <span>Pagada {formatDateDo(invoice.paidAt)}</span> : null}
                                    </div>
                                ),
                                links: invoice.pdfUrl ? (
                                    <a
                                        className="font-semibold text-primary-700 hover:text-primary-800"
                                        href={invoice.pdfUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Abrir PDF
                                    </a>
                                ) : undefined,
                            }))}
                            emptyTitle="Sin facturas registradas"
                            emptyBody="Cuando la organizacion emita facturas, veras aqui su estado y los accesos al PDF."
                        />
                    </div>
                </div>
            </div>
        </PageShell>
    );
}
