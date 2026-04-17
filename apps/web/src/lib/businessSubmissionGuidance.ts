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
const PREVENTIVE_MODERATION_THRESHOLD = 40;

export type BusinessSubmissionGuidanceInput = {
    name: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    website?: string;
    email?: string;
    address?: string;
    provinceId?: string;
    cityId?: string;
    sectorId?: string;
    categoryIds?: string[];
    featureIds?: string[];
    imageCount?: number;
};

type PreventiveSignal = {
    reason: string;
    points: number;
};

export type VisibilityCheck = {
    label: string;
    passed: boolean;
    detail: string;
};

export type BusinessSubmissionGuidance = {
    readinessScore: number;
    readinessLevel: 'ALTA' | 'MEDIA' | 'BAJA';
    blockedByLocalHeuristics: boolean;
    preventiveScore: number;
    preventiveSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
    riskClusters: string[];
    preventiveSignals: PreventiveSignal[];
    visibilityChecks: VisibilityCheck[];
    missingCriticalFields: string[];
    recommendedActions: string[];
};

function normalizeModerationText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

export function evaluateBusinessSubmissionGuidance(
    input: BusinessSubmissionGuidanceInput,
): BusinessSubmissionGuidance {
    const name = input.name.trim();
    const description = input.description.trim();
    const normalizedName = normalizeModerationText(name);
    const normalizedDescription = normalizeModerationText(description);
    const normalizedText = `${normalizedName} ${normalizedDescription}`.trim();
    const hasStructuredContact = Boolean(
        input.phone?.trim()
        || input.whatsapp?.trim()
        || input.website?.trim()
        || input.email?.trim(),
    );

    const preventiveSignals: PreventiveSignal[] = [];

    if (PREVENTIVE_SPAM_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
        preventiveSignals.push({
            reason: 'Palabras clave de spam o captacion externa en la ficha',
            points: 45,
        });
    }

    if (EXTERNAL_CONTACT_REGEX.test(description)) {
        preventiveSignals.push({
            reason: 'La descripcion incluye datos de contacto fuera de los campos estructurados',
            points: 20,
        });
    }

    if (EXTERNAL_LINK_REGEX.test(description)) {
        preventiveSignals.push({
            reason: 'La descripcion deriva trafico a canales externos antes de la verificacion',
            points: 15,
        });
    }

    if (description.length > 0 && description.length < 40 && (EXTERNAL_CONTACT_REGEX.test(description) || EXTERNAL_LINK_REGEX.test(description))) {
        preventiveSignals.push({
            reason: 'Descripcion demasiado corta para sustentar una oferta legitima',
            points: 10,
        });
    }

    if (!hasStructuredContact && EXTERNAL_CONTACT_REGEX.test(description)) {
        preventiveSignals.push({
            reason: 'Intenta derivar el contacto sin dejar un canal estructurado verificable',
            points: 15,
        });
    }

    const uppercaseRatio = description.replace(/[^A-Z]/g, '').length
        / Math.max(1, description.replace(/\s/g, '').length);
    if (Number.isFinite(uppercaseRatio) && uppercaseRatio > 0.65 && description.length > 30) {
        preventiveSignals.push({
            reason: 'Uso excesivo de mayusculas promocionales',
            points: 15,
        });
    }

    if (/(.)\1{5,}/.test(description)) {
        preventiveSignals.push({
            reason: 'Patron repetitivo poco natural en la descripcion',
            points: 10,
        });
    }

    const descriptionWords = normalizedDescription.split(' ').filter(Boolean);
    if (descriptionWords.length >= 10) {
        const uniqueWords = new Set(descriptionWords);
        const diversityRatio = uniqueWords.size / descriptionWords.length;
        if (diversityRatio < 0.45) {
            preventiveSignals.push({
                reason: 'Baja diversidad de contenido en la descripcion comercial',
                points: 10,
            });
        }
    }

    if (normalizedDescription.length > 0 && normalizedDescription === normalizedName) {
        preventiveSignals.push({
            reason: 'Nombre y descripcion repiten casi el mismo texto',
            points: 10,
        });
    }

    const visibilityChecks: VisibilityCheck[] = [
        {
            label: 'Propuesta clara',
            passed: description.length >= 60,
            detail: description.length >= 60
                ? 'La descripcion ya da suficiente contexto para entender el negocio.'
                : 'Amplia la descripcion para explicar que vendes, donde operas y que te diferencia.',
        },
        {
            label: 'Contacto visible',
            passed: hasStructuredContact,
            detail: hasStructuredContact
                ? 'La ficha tendra al menos un canal util desde el primer dia.'
                : 'Completa WhatsApp, telefono, website o email para mejorar conversion.',
        },
        {
            label: 'Ubicacion util',
            passed: Boolean(input.address?.trim() && input.provinceId),
            detail: input.address?.trim() && input.provinceId
                ? 'La ubicacion ya esta clara para mostrar el negocio en la zona correcta.'
                : 'Completa direccion y provincia para aparecer mejor en busquedas cercanas.',
        },
        {
            label: 'Categoria lista',
            passed: (input.categoryIds?.length ?? 0) > 0,
            detail: (input.categoryIds?.length ?? 0) > 0
                ? 'El negocio ya tiene categoria para publicarse.'
                : 'Selecciona al menos una categoria antes de publicar.',
        },
        {
            label: 'Senales de confianza',
            passed: Boolean(input.cityId || input.sectorId || (input.imageCount ?? 0) > 0),
            detail: input.cityId || input.sectorId || (input.imageCount ?? 0) > 0
                ? 'Ya hay contexto extra para aumentar confianza y relevancia.'
                : 'Agrega ciudad/sector o algunas imagenes para reforzar confianza.',
        },
    ];

    const preventiveScore = Math.min(
        100,
        preventiveSignals.reduce((total, signal) => total + signal.points, 0),
    );
    const readinessScore = Math.max(
        0,
        Math.min(
            100,
            (visibilityChecks.filter((item) => item.passed).length * 20)
            - preventiveSignals.reduce((total, signal) => total + Math.round(signal.points / 5), 0),
        ),
    );
    const readinessLevel: 'ALTA' | 'MEDIA' | 'BAJA' = readinessScore >= 80
        ? 'ALTA'
        : readinessScore >= 50
            ? 'MEDIA'
            : 'BAJA';
    const preventiveSeverity: 'LOW' | 'MEDIUM' | 'HIGH' = preventiveScore >= 70
        ? 'HIGH'
        : preventiveScore >= PREVENTIVE_MODERATION_THRESHOLD
            ? 'MEDIUM'
            : 'LOW';
    const missingCriticalFields = visibilityChecks
        .filter((item) => !item.passed)
        .map((item) => item.label);
    const riskClusters = uniqueValues([
        ...preventiveSignals.map((signal) => {
            if (
                signal.reason.includes('spam')
                || signal.reason.includes('mayusculas')
                || signal.reason.includes('repetitivo')
                || signal.reason.includes('diversidad')
                || signal.reason.includes('Descripcion demasiado corta')
                || signal.reason.includes('Nombre y descripcion')
            ) {
                return 'Contenido';
            }
            if (
                signal.reason.includes('contacto')
                || signal.reason.includes('canales externos')
                || signal.reason.includes('canal estructurado')
            ) {
                return 'Contacto';
            }
            return 'Confianza';
        }),
        ...(!hasStructuredContact ? ['Contacto'] : []),
        ...(!(input.address?.trim() && input.provinceId) ? ['Ubicacion'] : []),
    ]);
    const recommendedActions = uniqueValues([
        ...preventiveSignals.map((signal) => {
            if (signal.reason.includes('contacto') || signal.reason.includes('canal estructurado')) {
                return 'Mueve telefonos, WhatsApp y emails a sus campos estructurados.';
            }
            if (signal.reason.includes('canales externos')) {
                return 'Evita poner links o derivaciones externas dentro de la descripcion.';
            }
            if (signal.reason.includes('Descripcion demasiado corta')) {
                return 'Amplia la propuesta comercial con servicios, zona y diferenciadores antes de reenviar.';
            }
            if (signal.reason.includes('mayusculas')) {
                return 'Reescribe la descripcion con tono natural, sin bloques promocionales en mayusculas.';
            }
            if (signal.reason.includes('Nombre y descripcion')) {
                return 'Haz que la descripcion aporte contexto real y no repita solo el nombre del negocio.';
            }
            if (signal.reason.includes('diversidad') || signal.reason.includes('repetitivo')) {
                return 'Haz la descripcion mas especifica y menos repetitiva.';
            }
            return 'Revisa la ficha para que se vea clara y confiable antes de enviarla.';
        }),
        ...visibilityChecks.filter((item) => !item.passed).map((item) => item.detail),
    ]);

    return {
        readinessScore,
        readinessLevel,
        blockedByLocalHeuristics: preventiveScore >= PREVENTIVE_MODERATION_THRESHOLD,
        preventiveScore,
        preventiveSeverity,
        riskClusters,
        preventiveSignals,
        visibilityChecks,
        missingCriticalFields,
        recommendedActions,
    };
}
