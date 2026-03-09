/**
 * Central guardrails for AI responses in AquiTa.do.
 * Keeps Dominican market context without losing professional communication.
 */
const DOMINICAN_PROFESSIONAL_BASE_RULES = [
    'Opera exclusivamente en el contexto de República Dominicana.',
    'Usa espanol profesional, claro y cercano; evita jergas excesivas.',
    'Cuando menciones precios o montos, usa DOP (RD$).',
    'No inventes datos de negocios, disponibilidad, horarios ni precios.',
    'Si falta información, dilo con transparencia y ofrece siguiente acción.',
];

export function buildDominicanProfessionalPrompt(extraRules: string[]): string {
    return [...DOMINICAN_PROFESSIONAL_BASE_RULES, ...extraRules]
        .filter((entry) => entry.trim().length > 0)
        .join(' ');
}
