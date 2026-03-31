import { BusinessVerificationStatus } from '../generated/prisma/client';

export type PreventiveModerationResult = {
    blocked: boolean;
    score: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    riskClusters: string[];
    reasons: string[];
    currentStatus: BusinessVerificationStatus;
    currentNotes: string | null;
};

type PreventiveModerationReason = {
    reason: string;
    points: number;
};

type PreventiveModerationSnapshot = {
    name: string;
    description: string;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    email?: string | null;
    verificationStatus: BusinessVerificationStatus;
    verificationNotes: string | null;
    ownerBusinessBurst: number;
    duplicateListingCount: number;
    duplicatePhoneCount: number;
    duplicateWhatsappCount: number;
    duplicateEmailCount: number;
    duplicateWebsiteCount: number;
};

const PREVENTIVE_MODERATION_THRESHOLD = 40;
const PREVENTIVE_MODERATION_NOTE_PREFIX = 'Revision preventiva requerida antes del KYC';
const PREVENTIVE_SPAM_KEYWORDS = [
    'gana dinero',
    'click aqui',
    'haz clic aqui',
    'prestamo rapido',
    'viagra',
    'crypto',
    'bitcoin',
    'onlyfans',
    'telegram',
    'casino',
    'apuesta',
    'contenido xxx',
    'dm',
    'inbox',
];

const EXTERNAL_LINK_REGEX = /(https?:\/\/|www\.|wa\.me|bit\.ly|instagram\.com|facebook\.com|tiktok\.com)/i;
const EXTERNAL_CONTACT_REGEX = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(\+?\d[\d\s().-]{7,}\d))/i;

export function evaluatePreventiveModerationSnapshot(
    snapshot: PreventiveModerationSnapshot,
): PreventiveModerationResult {
    const reasons: PreventiveModerationReason[] = [];
    const normalizedName = normalizeModerationText(snapshot.name);
    const normalizedDescription = normalizeModerationText(snapshot.description);
    const normalizedText = `${normalizedName} ${normalizedDescription}`.trim();

    if (PREVENTIVE_SPAM_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
        reasons.push({
            reason: 'Palabras clave de spam o captacion externa en la ficha',
            points: 45,
        });
    }

    if (EXTERNAL_CONTACT_REGEX.test(snapshot.description)) {
        reasons.push({
            reason: 'La descripcion incluye datos de contacto fuera de los campos estructurados',
            points: 20,
        });
    }

    if (EXTERNAL_LINK_REGEX.test(snapshot.description)) {
        reasons.push({
            reason: 'La descripcion deriva trafico a canales externos antes de la verificacion',
            points: 15,
        });
    }

    if (
        snapshot.description.length > 0
        && snapshot.description.length < 40
        && (EXTERNAL_CONTACT_REGEX.test(snapshot.description) || EXTERNAL_LINK_REGEX.test(snapshot.description))
    ) {
        reasons.push({
            reason: 'Descripcion demasiado corta para sustentar una oferta legitima',
            points: 10,
        });
    }

    if (
        !snapshot.phone?.trim()
        && !snapshot.whatsapp?.trim()
        && !snapshot.website?.trim()
        && !snapshot.email?.trim()
        && EXTERNAL_CONTACT_REGEX.test(snapshot.description)
    ) {
        reasons.push({
            reason: 'Intenta derivar el contacto sin dejar un canal estructurado verificable',
            points: 15,
        });
    }

    const uppercaseRatio = snapshot.description.replace(/[^A-Z]/g, '').length
        / Math.max(1, snapshot.description.replace(/\s/g, '').length);
    if (Number.isFinite(uppercaseRatio) && uppercaseRatio > 0.65 && snapshot.description.length > 30) {
        reasons.push({
            reason: 'Uso excesivo de mayusculas promocionales',
            points: 15,
        });
    }

    if (/(.)\1{5,}/.test(snapshot.description)) {
        reasons.push({
            reason: 'Patron repetitivo poco natural en la descripcion',
            points: 10,
        });
    }

    const descriptionWords = normalizedDescription.split(' ').filter(Boolean);
    if (descriptionWords.length >= 10) {
        const uniqueWords = new Set(descriptionWords);
        const diversityRatio = uniqueWords.size / descriptionWords.length;
        if (diversityRatio < 0.45) {
            reasons.push({
                reason: 'Baja diversidad de contenido en la descripcion comercial',
                points: 10,
            });
        }
    }

    if (normalizedDescription.length > 0 && normalizedDescription === normalizedName) {
        reasons.push({
            reason: 'Nombre y descripcion repiten casi el mismo texto',
            points: 10,
        });
    }

    if (snapshot.ownerBusinessBurst >= 3) {
        reasons.push({
            reason: 'Creacion acelerada de multiples negocios por la misma cuenta',
            points: snapshot.ownerBusinessBurst >= 5 ? 35 : 20,
        });
    }

    if (snapshot.duplicateListingCount > 0) {
        reasons.push({
            reason: 'Existe otra ficha casi identica en una organizacion distinta',
            points: 35,
        });
    }

    const duplicateContactFields = [
        snapshot.duplicatePhoneCount > 0 ? 'telefono' : null,
        snapshot.duplicateWhatsappCount > 0 ? 'whatsapp' : null,
        snapshot.duplicateEmailCount > 0 ? 'email' : null,
        snapshot.duplicateWebsiteCount > 0 ? 'sitio web' : null,
    ].filter((value): value is string => Boolean(value));

    if (duplicateContactFields.length > 0) {
        reasons.push({
            reason: `Comparte ${duplicateContactFields.join(', ')} con otro negocio fuera de su organizacion`,
            points: 25,
        });
    }

    const score = Math.min(
        100,
        reasons.reduce((total, current) => total + current.points, 0),
    );
    const severity: PreventiveModerationResult['severity'] = score >= 70
        ? 'HIGH'
        : score >= PREVENTIVE_MODERATION_THRESHOLD
            ? 'MEDIUM'
            : 'LOW';

    return {
        blocked: score >= PREVENTIVE_MODERATION_THRESHOLD,
        score,
        severity,
        riskClusters: buildPreventiveRiskClusters(reasons.map((item) => item.reason)),
        reasons: reasons.map((item) => item.reason),
        currentStatus: snapshot.verificationStatus,
        currentNotes: snapshot.verificationNotes,
    };
}

export function resolvePreventiveBlockedStatus(
    currentStatus: BusinessVerificationStatus,
): BusinessVerificationStatus {
    if (currentStatus === 'REJECTED' || currentStatus === 'SUSPENDED') {
        return currentStatus;
    }

    return 'UNVERIFIED';
}

export function buildPreventiveModerationNote(
    reasons: string[],
    currentNotes?: string | null,
    adminNotes?: string | null,
): string {
    const baseMessage = `${PREVENTIVE_MODERATION_NOTE_PREFIX}: ${reasons.join('; ')}. Ajusta la ficha y vuelve a intentarlo.`;
    const extraNotes = [
        currentNotes?.trim() && !isPreventiveModerationNote(currentNotes)
            ? `Observacion previa: ${currentNotes.trim()}`
            : null,
        adminNotes?.trim()
            ? `Decision admin: ${adminNotes.trim()}`
            : null,
    ].filter((note): note is string => Boolean(note));

    return [baseMessage, ...extraNotes].join(' ').slice(0, 500);
}

export function buildPreventiveModerationErrorMessage(reasons: string[]): string {
    return `Tu negocio requiere revision preventiva antes del KYC: ${reasons.join('; ')}. Corrige la ficha y vuelve a intentarlo.`;
}

export function buildPreventiveSuggestedActions(reasons: string[]): string[] {
    const suggestions = new Set<string>();

    for (const reason of reasons) {
        if (reason.includes('contacto fuera de los campos estructurados')) {
            suggestions.add('Mueve telefonos, WhatsApp y emails a sus campos dedicados.');
        }
        if (reason.includes('canales externos')) {
            suggestions.add('Quita links y derivaciones externas de la descripcion antes de reenviar a KYC.');
        }
        if (reason.includes('Descripcion demasiado corta')) {
            suggestions.add('Amplia la descripcion con propuesta, zona y servicios reales antes de reenviar.');
        }
        if (reason.includes('spam')) {
            suggestions.add('Reescribe la descripcion con enfoque informativo, sin frases de captacion o spam.');
        }
        if (reason.includes('canal estructurado')) {
            suggestions.add('Agrega al menos un canal estructurado verificable antes de volver a enviar la ficha.');
        }
        if (reason.includes('mayusculas')) {
            suggestions.add('Normaliza el texto y evita bloques promocionales en mayusculas.');
        }
        if (reason.includes('diversidad') || reason.includes('repetitivo')) {
            suggestions.add('Haz la descripcion mas especifica y menos repetitiva.');
        }
        if (reason.includes('Nombre y descripcion')) {
            suggestions.add('Evita repetir el nombre del negocio en la descripcion y agrega contexto comercial real.');
        }
        if (reason.includes('Creacion acelerada')) {
            suggestions.add('Agrupa altas legitimas y evita bursts de negocios casi simultaneos desde la misma cuenta.');
        }
        if (reason.includes('ficha casi identica') || reason.includes('Comparte')) {
            suggestions.add('Revisa duplicados, contactos compartidos y diferencias reales entre fichas antes de reenviar.');
        }
    }

    return [...suggestions].slice(0, 4);
}

export function isPreventiveModerationNote(note?: string | null): boolean {
    return note?.startsWith(PREVENTIVE_MODERATION_NOTE_PREFIX) ?? false;
}

function normalizeModerationText(value?: string | null): string {
    return (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildPreventiveRiskClusters(reasons: string[]): string[] {
    const clusters = new Set<string>();

    for (const reason of reasons) {
        if (
            reason.includes('spam')
            || reason.includes('mayusculas')
            || reason.includes('repetitivo')
            || reason.includes('diversidad')
            || reason.includes('Descripcion demasiado corta')
            || reason.includes('Nombre y descripcion')
        ) {
            clusters.add('Contenido');
        }
        if (
            reason.includes('contacto')
            || reason.includes('canales externos')
            || reason.includes('canal estructurado')
        ) {
            clusters.add('Contacto');
        }
        if (reason.includes('Creacion acelerada')) {
            clusters.add('Velocidad');
        }
        if (reason.includes('ficha casi identica') || reason.includes('Comparte')) {
            clusters.add('Identidad');
        }
    }

    return [...clusters];
}
