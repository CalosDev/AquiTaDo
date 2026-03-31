import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    resolveDateRange,
    resolveFiscalPeriod,
    toCsv,
} from './payments.helpers';

@Injectable()
export class PaymentsReportingService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async getBillingSummary(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = resolveDateRange(from, to);
        const createdAtRange = resolveDateRange(from, to);

        const invoiceWhere: Prisma.InvoiceWhereInput = {
            organizationId,
            ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
        };
        const paymentWhere: Prisma.PaymentWhereInput = {
            organizationId,
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
        };
        const transactionWhere: Prisma.TransactionWhereInput = {
            organizationId,
            status: 'SUCCEEDED',
            ...(createdAtRange ? { createdAt: createdAtRange } : {}),
        };

        const [invoiceStatusStats, paymentStatusStats, transactionSummary] = await Promise.all([
            this.prisma.invoice.groupBy({
                by: ['status'],
                where: invoiceWhere,
                _count: { _all: true },
                _sum: {
                    amountSubtotal: true,
                    amountTax: true,
                    amountTotal: true,
                },
            }),
            this.prisma.payment.groupBy({
                by: ['status'],
                where: paymentWhere,
                _count: { _all: true },
                _sum: {
                    amount: true,
                },
            }),
            this.prisma.transaction.aggregate({
                where: transactionWhere,
                _count: { _all: true },
                _sum: {
                    grossAmount: true,
                    platformFeeAmount: true,
                    netAmount: true,
                },
            }),
        ]);

        const invoiceByStatus: Record<string, { count: number; total: number }> = {};
        for (const row of invoiceStatusStats) {
            invoiceByStatus[row.status] = {
                count: row._count._all,
                total: Number(row._sum.amountTotal?.toString() ?? '0'),
            };
        }

        const paymentByStatus: Record<string, { count: number; total: number }> = {};
        for (const row of paymentStatusStats) {
            paymentByStatus[row.status] = {
                count: row._count._all,
                total: Number(row._sum.amount?.toString() ?? '0'),
            };
        }

        return {
            range: { from: from ?? null, to: to ?? null },
            invoices: {
                byStatus: invoiceByStatus,
                subtotal: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountSubtotal?.toString() ?? '0'),
                    0,
                ),
                tax: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountTax?.toString() ?? '0'),
                    0,
                ),
                total: invoiceStatusStats.reduce(
                    (sum, row) => sum + Number(row._sum.amountTotal?.toString() ?? '0'),
                    0,
                ),
            },
            payments: {
                byStatus: paymentByStatus,
                totalCollected: paymentByStatus.SUCCEEDED?.total ?? 0,
                totalFailed: paymentByStatus.FAILED?.total ?? 0,
            },
            marketplace: {
                successfulTransactions: transactionSummary._count._all,
                grossAmount: Number(transactionSummary._sum.grossAmount?.toString() ?? '0'),
                platformFeeAmount: Number(transactionSummary._sum.platformFeeAmount?.toString() ?? '0'),
                netAmount: Number(transactionSummary._sum.netAmount?.toString() ?? '0'),
            },
        };
    }

    async exportInvoicesCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = resolveDateRange(from, to);
        const invoices = await this.prisma.invoice.findMany({
            where: {
                organizationId,
                ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
            },
            orderBy: { issuedAt: 'desc' },
        });

        const headers = [
            'invoice_id',
            'number',
            'status',
            'issued_at',
            'due_at',
            'paid_at',
            'currency',
            'subtotal',
            'tax',
            'total',
            'pdf_url',
        ];

        const rows = invoices.map((invoice) => [
            invoice.id,
            invoice.number ?? '',
            invoice.status,
            invoice.issuedAt.toISOString(),
            invoice.dueAt?.toISOString() ?? '',
            invoice.paidAt?.toISOString() ?? '',
            invoice.currency,
            invoice.amountSubtotal.toString(),
            invoice.amountTax.toString(),
            invoice.amountTotal.toString(),
            invoice.pdfUrl ?? '',
        ]);

        const csv = toCsv(headers, rows);
        const fileName = `invoices_${organizationId}_${new Date().toISOString().slice(0, 10)}.csv`;

        return { fileName, csv };
    }

    async exportPaymentsCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const createdAtRange = resolveDateRange(from, to);
        const payments = await this.prisma.payment.findMany({
            where: {
                organizationId,
                ...(createdAtRange ? { createdAt: createdAtRange } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });

        const headers = [
            'payment_id',
            'provider',
            'provider_payment_intent_id',
            'status',
            'amount',
            'currency',
            'created_at',
            'paid_at',
            'failure_reason',
        ];

        const rows = payments.map((payment) => [
            payment.id,
            payment.provider,
            payment.providerPaymentIntentId ?? '',
            payment.status,
            payment.amount.toString(),
            payment.currency,
            payment.createdAt.toISOString(),
            payment.paidAt?.toISOString() ?? '',
            payment.failureReason ?? '',
        ]);

        const csv = toCsv(headers, rows);
        const fileName = `payments_${organizationId}_${new Date().toISOString().slice(0, 10)}.csv`;

        return { fileName, csv };
    }

    async getFiscalSummary(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = resolveDateRange(from, to);
        const invoices = await this.prisma.invoice.findMany({
            where: {
                organizationId,
                ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
            },
            select: {
                id: true,
                status: true,
                issuedAt: true,
                paidAt: true,
                amountSubtotal: true,
                amountTax: true,
                amountTotal: true,
            },
            orderBy: { issuedAt: 'asc' },
        });

        const monthlyMap = new Map<string, {
            period: string;
            invoicesIssued: number;
            invoicesPaid: number;
            subtotal: number;
            tax: number;
            total: number;
            paidTotal: number;
        }>();

        let invoicesIssued = 0;
        let invoicesPaid = 0;
        let subtotal = 0;
        let tax = 0;
        let total = 0;
        let paidTotal = 0;

        for (const invoice of invoices) {
            const rowSubtotal = Number(invoice.amountSubtotal.toString());
            const rowTax = Number(invoice.amountTax.toString());
            const rowTotal = Number(invoice.amountTotal.toString());
            const isPaid = invoice.status === 'PAID';
            const period = resolveFiscalPeriod(invoice.issuedAt);

            invoicesIssued += 1;
            subtotal += rowSubtotal;
            tax += rowTax;
            total += rowTotal;
            if (isPaid) {
                invoicesPaid += 1;
                paidTotal += rowTotal;
            }

            const existing = monthlyMap.get(period) ?? {
                period,
                invoicesIssued: 0,
                invoicesPaid: 0,
                subtotal: 0,
                tax: 0,
                total: 0,
                paidTotal: 0,
            };

            existing.invoicesIssued += 1;
            existing.subtotal += rowSubtotal;
            existing.tax += rowTax;
            existing.total += rowTotal;
            if (isPaid) {
                existing.invoicesPaid += 1;
                existing.paidTotal += rowTotal;
            }

            monthlyMap.set(period, existing);
        }

        const monthly = Array.from(monthlyMap.values())
            .sort((a, b) => a.period.localeCompare(b.period))
            .map((row) => ({
                ...row,
                subtotal: Number(row.subtotal.toFixed(2)),
                tax: Number(row.tax.toFixed(2)),
                total: Number(row.total.toFixed(2)),
                paidTotal: Number(row.paidTotal.toFixed(2)),
            }));

        return {
            range: { from: from ?? null, to: to ?? null },
            totals: {
                invoicesIssued,
                invoicesPaid,
                subtotal: Number(subtotal.toFixed(2)),
                tax: Number(tax.toFixed(2)),
                total: Number(total.toFixed(2)),
                paidTotal: Number(paidTotal.toFixed(2)),
                pendingTotal: Number((total - paidTotal).toFixed(2)),
            },
            monthly,
        };
    }

    async exportFiscalCsv(
        organizationId: string,
        from?: string,
        to?: string,
    ) {
        const issuedAtRange = resolveDateRange(from, to);
        const invoices = await this.prisma.invoice.findMany({
            where: {
                organizationId,
                ...(issuedAtRange ? { issuedAt: issuedAtRange } : {}),
            },
            orderBy: { issuedAt: 'desc' },
            select: {
                id: true,
                status: true,
                issuedAt: true,
                paidAt: true,
                currency: true,
                amountSubtotal: true,
                amountTax: true,
                amountTotal: true,
            },
        });

        const headers = [
            'period',
            'invoice_id',
            'status',
            'issued_at',
            'paid_at',
            'currency',
            'subtotal',
            'tax',
            'total',
        ];

        const rows = invoices.map((invoice) => [
            resolveFiscalPeriod(invoice.issuedAt),
            invoice.id,
            invoice.status,
            invoice.issuedAt.toISOString(),
            invoice.paidAt?.toISOString() ?? '',
            invoice.currency,
            invoice.amountSubtotal.toString(),
            invoice.amountTax.toString(),
            invoice.amountTotal.toString(),
        ]);

        const csv = toCsv(headers, rows);
        const fileName = `fiscal_${organizationId}_${new Date().toISOString().slice(0, 10)}.csv`;

        return { fileName, csv };
    }
}
