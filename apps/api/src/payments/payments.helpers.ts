import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import {
    OrganizationPlan,
    OrganizationSubscriptionStatus,
    Prisma,
    SubscriptionStatus,
} from '../generated/prisma/client';

export function resolveStringId(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
    }

    return null;
}

export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
        case 'active':
        case 'trialing':
            return 'ACTIVE';
        case 'past_due':
            return 'PAST_DUE';
        case 'canceled':
            return 'CANCELED';
        case 'incomplete':
        case 'incomplete_expired':
            return 'INCOMPLETE';
        case 'unpaid':
            return 'UNPAID';
        default:
            return 'ACTIVE';
    }
}

export function mapSubscriptionToOrganizationStatus(
    status: SubscriptionStatus,
): OrganizationSubscriptionStatus {
    switch (status) {
        case 'PAST_DUE':
            return 'PAST_DUE';
        case 'CANCELED':
            return 'CANCELED';
        default:
            return 'ACTIVE';
    }
}

export function resolveBookingChargeAmount(
    quotedAmount: Prisma.Decimal | null,
    depositAmount: Prisma.Decimal | null,
): number {
    const deposit = depositAmount ? Number(depositAmount.toString()) : 0;
    const quoted = quotedAmount ? Number(quotedAmount.toString()) : 0;
    const amount = deposit > 0 ? deposit : quoted;
    return roundMoney(Math.max(amount, 0));
}

export function normalizeRawBody(body: unknown): Buffer | null {
    if (Buffer.isBuffer(body)) {
        return body;
    }

    if (typeof body === 'string') {
        return Buffer.from(body);
    }

    if (body && typeof body === 'object') {
        try {
            return Buffer.from(JSON.stringify(body));
        } catch {
            return null;
        }
    }

    return null;
}

export function resolvePlanCode(value: string | undefined): OrganizationPlan | null {
    if (!value) {
        return null;
    }

    if (value === 'FREE' || value === 'GROWTH' || value === 'SCALE') {
        return value;
    }

    return null;
}

export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export function mergeJsonObject(
    base: Prisma.JsonValue | null | undefined,
    extra: Record<string, unknown>,
): Prisma.InputJsonValue {
    const normalizedBase =
        base && typeof base === 'object' && !Array.isArray(base)
            ? (base as Record<string, unknown>)
            : {};
    return {
        ...normalizedBase,
        ...extra,
    } as Prisma.InputJsonValue;
}

export function asJson(payload: unknown): Prisma.InputJsonValue {
    return payload as Prisma.InputJsonValue;
}

export function resolveDateRange(
    from?: string,
    to?: string,
): Prisma.DateTimeFilter | null {
    if (!from && !to) {
        return null;
    }

    const range: Prisma.DateTimeFilter = {};
    if (from) {
        const parsedFrom = new Date(from);
        if (Number.isNaN(parsedFrom.getTime())) {
            throw new BadRequestException('Fecha inicial invalida');
        }
        range.gte = parsedFrom;
    }

    if (to) {
        const parsedTo = new Date(to);
        if (Number.isNaN(parsedTo.getTime())) {
            throw new BadRequestException('Fecha final invalida');
        }
        range.lte = parsedTo;
    }

    return range;
}

export function toCsv(headers: string[], rows: Array<Array<string>>): string {
    const serializedHeaders = headers.map((header) => escapeCsv(header)).join(',');
    const serializedRows = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(','));
    return [serializedHeaders, ...serializedRows].join('\n');
}

export function resolveFiscalPeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function escapeCsv(value: string): string {
    const normalizedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

    if (
        !normalizedValue.includes(',')
        && !normalizedValue.includes('"')
        && !normalizedValue.includes('\n')
    ) {
        return normalizedValue;
    }

    return `"${normalizedValue.replace(/"/g, '""')}"`;
}
