import type { Dispatch, SetStateAction } from 'react';

type CsvTarget = 'invoices' | 'payments' | 'fiscal';

interface BillingSummary {
    invoices: {
        byStatus: Record<string, { count: number; total: number }>;
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

interface FiscalSummary {
    totals: {
        invoicesIssued: number;
        invoicesPaid: number;
        subtotal: number;
        tax: number;
        total: number;
        paidTotal: number;
        pendingTotal: number;
    };
    monthly: Array<{
        period: string;
        invoicesIssued: number;
        invoicesPaid: number;
        subtotal: number;
        tax: number;
        total: number;
        paidTotal: number;
    }>;
}

interface BillingRange {
    from: string;
    to: string;
}

interface PaymentRow {
    id: string;
    provider: string;
    amount: string | number;
    currency: string;
    status: string;
    paidAt?: string | null;
    createdAt: string;
}

interface InvoiceRow {
    id: string;
    number?: string | null;
    amountTotal: string | number;
    currency: string;
    status: string;
    issuedAt: string;
    dueAt?: string | null;
    paidAt?: string | null;
}

interface TransactionRow {
    id: string;
    status: string;
    grossAmount: string | number;
    platformFeeAmount: string | number;
    netAmount: string | number;
    currency: string;
    createdAt: string;
    paidAt?: string | null;
    business: { id: string; name: string; slug: string };
    booking?: { id: string; scheduledFor: string; status: string } | null;
    buyerUser?: { id: string; name: string; email: string } | null;
}

interface DashboardBillingTabProps {
    billingRange: BillingRange;
    setBillingRange: Dispatch<SetStateAction<BillingRange>>;
    loadBillingSummary: () => Promise<void>;
    billingLoading: boolean;
    handleDownloadCsv: (target: CsvTarget) => Promise<void>;
    exportingCsv: CsvTarget | null;
    billingSummary: BillingSummary | null;
    fiscalSummary: FiscalSummary | null;
    recentPayments: PaymentRow[];
    recentInvoices: InvoiceRow[];
    recentTransactions: TransactionRow[];
    formatCurrency: (value: string | number | null | undefined) => string;
    formatDateTime: (value?: string | null) => string;
}

export function DashboardBillingTab({
    billingRange,
    setBillingRange,
    loadBillingSummary,
    billingLoading,
    handleDownloadCsv,
    exportingCsv,
    billingSummary,
    fiscalSummary,
    recentPayments,
    recentInvoices,
    recentTransactions,
    formatCurrency,
    formatDateTime,
}: DashboardBillingTabProps) {
    const invoiceStatuses = Object.entries(billingSummary?.invoices.byStatus || {});
    const paymentStatuses = Object.entries(billingSummary?.payments.byStatus || {});
    const monthlyFiscalRows = fiscalSummary?.monthly ?? [];

    return (
        <div className="space-y-6">
            <div className="card p-5">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="billing-range-from" className="text-xs text-gray-500 block mb-1">Desde</label>
                        <input id="billing-range-from" type="date" className="input-field text-sm" value={billingRange.from} onChange={(event) => setBillingRange((previous) => ({ ...previous, from: event.target.value }))} />
                    </div>
                    <div>
                        <label htmlFor="billing-range-to" className="text-xs text-gray-500 block mb-1">Hasta</label>
                        <input id="billing-range-to" type="date" className="input-field text-sm" value={billingRange.to} onChange={(event) => setBillingRange((previous) => ({ ...previous, to: event.target.value }))} />
                    </div>
                    <button type="button" className="btn-primary text-sm" onClick={() => void loadBillingSummary()} disabled={billingLoading}>{billingLoading ? 'Cargando...' : 'Actualizar'}</button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('invoices')} disabled={exportingCsv === 'invoices'}>{exportingCsv === 'invoices' ? 'Exportando...' : 'Facturas CSV'}</button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('payments')} disabled={exportingCsv === 'payments'}>{exportingCsv === 'payments' ? 'Exportando...' : 'Pagos CSV'}</button>
                    <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('fiscal')} disabled={exportingCsv === 'fiscal'}>{exportingCsv === 'fiscal' ? 'Exportando...' : 'Reporte fiscal CSV'}</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">Total facturado</p><p className="text-xl font-bold text-primary-700">{formatCurrency(billingSummary?.invoices.total || 0)}</p></div>
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">Cobrado</p><p className="text-xl font-bold text-primary-700">{formatCurrency(billingSummary?.payments.totalCollected || 0)}</p></div>
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">Fallido</p><p className="text-xl font-bold text-red-700">{formatCurrency(billingSummary?.payments.totalFailed || 0)}</p></div>
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">Comision plataforma</p><p className="text-xl font-bold text-amber-700">{formatCurrency(billingSummary?.marketplace.platformFeeAmount || 0)}</p></div>
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">ITBIS acumulado</p><p className="text-xl font-bold text-accent-700">{formatCurrency(fiscalSummary?.totals.tax || 0)}</p></div>
                <div className="card p-4 text-center"><p className="text-xs text-gray-500">Facturas pagadas</p><p className="text-xl font-bold text-primary-700">{fiscalSummary?.totals.invoicesPaid || 0}</p></div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Facturas por estado</h3>
                    <div className="space-y-2">
                        {invoiceStatuses.length > 0 ? invoiceStatuses.map(([status, row]) => (
                            <div key={status} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                <span className="text-sm text-gray-700">{status}</span>
                                <span className="text-sm text-gray-900">{row.count} - {formatCurrency(row.total)}</span>
                            </div>
                        )) : <p className="text-sm text-gray-500">Sin datos de facturas.</p>}
                    </div>
                </div>
                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Pagos por estado</h3>
                    <div className="space-y-2">
                        {paymentStatuses.length > 0 ? paymentStatuses.map(([status, row]) => (
                            <div key={status} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                <span className="text-sm text-gray-700">{status}</span>
                                <span className="text-sm text-gray-900">{row.count} - {formatCurrency(row.total)}</span>
                            </div>
                        )) : <p className="text-sm text-gray-500">Sin datos de pagos.</p>}
                    </div>
                </div>
            </div>

            <div className="card p-5">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Resumen fiscal mensual</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-100 text-gray-500">
                            <tr>
                                <th className="text-left py-2">Periodo</th>
                                <th className="text-left py-2">Emitidas</th>
                                <th className="text-left py-2">Pagadas</th>
                                <th className="text-left py-2">Subtotal</th>
                                <th className="text-left py-2">ITBIS</th>
                                <th className="text-left py-2">Total</th>
                                <th className="text-left py-2">Cobrado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlyFiscalRows.length > 0 ? monthlyFiscalRows.map((row) => (
                                <tr key={row.period} className="border-b border-gray-50">
                                    <td className="py-2">{row.period}</td>
                                    <td className="py-2">{row.invoicesIssued}</td>
                                    <td className="py-2">{row.invoicesPaid}</td>
                                    <td className="py-2">{formatCurrency(row.subtotal)}</td>
                                    <td className="py-2">{formatCurrency(row.tax)}</td>
                                    <td className="py-2">{formatCurrency(row.total)}</td>
                                    <td className="py-2">{formatCurrency(row.paidTotal)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td className="py-3 text-gray-500" colSpan={7}>Sin datos fiscales en el rango seleccionado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Pagos recientes</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {recentPayments.length > 0 ? recentPayments.map((payment) => (
                            <div key={payment.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-gray-900">{payment.provider}</p>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {payment.status}
                                    </span>
                                </div>
                                <p className="text-gray-700 mt-1">{formatCurrency(payment.amount)}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formatDateTime(payment.paidAt || payment.createdAt)}
                                </p>
                            </div>
                        )) : (
                            <p className="text-sm text-gray-500">Sin pagos recientes.</p>
                        )}
                    </div>
                </div>

                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Facturas recientes</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {recentInvoices.length > 0 ? recentInvoices.map((invoice) => (
                            <div key={invoice.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-gray-900 truncate">
                                        {invoice.number || invoice.id.slice(0, 8)}
                                    </p>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {invoice.status}
                                    </span>
                                </div>
                                <p className="text-gray-700 mt-1">{formatCurrency(invoice.amountTotal)}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Emitida: {formatDateTime(invoice.issuedAt)}
                                </p>
                            </div>
                        )) : (
                            <p className="text-sm text-gray-500">Sin facturas recientes.</p>
                        )}
                    </div>
                </div>

                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Transacciones marketplace</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
                            <div key={transaction.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-gray-900 truncate">{transaction.business.name}</p>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {transaction.status}
                                    </span>
                                </div>
                                <p className="text-gray-700 mt-1">
                                    Neto: {formatCurrency(transaction.netAmount)}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Fee: {formatCurrency(transaction.platformFeeAmount)}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formatDateTime(transaction.paidAt || transaction.createdAt)}
                                </p>
                            </div>
                        )) : (
                            <p className="text-sm text-gray-500">Sin transacciones recientes.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
