import { describe, expect, it } from 'vitest';
import { evaluateBusinessSubmissionGuidance } from './businessSubmissionGuidance';

describe('evaluateBusinessSubmissionGuidance', () => {
    it('flags risky descriptions that would likely trigger preventive moderation', () => {
        const guidance = evaluateBusinessSubmissionGuidance({
            name: 'Oferta extrema',
            description: 'GANA DINERO RAPIDO CLICK AQUI TELEGRAM WHATSAPP +1 809 555 2233 WWW.OFERTA-RARA.TEST',
            address: 'Av. Principal 12',
            provinceId: 'province-id',
            categoryIds: ['cat-1'],
        });

        expect(guidance.blockedByLocalHeuristics).toBe(true);
        expect(guidance.preventiveScore).toBeGreaterThanOrEqual(40);
        expect(guidance.preventiveSeverity).toBe('HIGH');
        expect(guidance.riskClusters).toEqual(expect.arrayContaining(['Contenido', 'Contacto']));
        expect(guidance.preventiveSignals.map((signal) => signal.reason)).toEqual(
            expect.arrayContaining([
                'Palabras clave de spam o captacion externa en la ficha',
                'La descripcion incluye datos de contacto fuera de los campos estructurados',
            ]),
        );
    });

    it('rewards a complete and clean business payload', () => {
        const guidance = evaluateBusinessSubmissionGuidance({
            name: 'Cafe del Barrio',
            description: 'Cafeteria de especialidad en Naco con desayunos, brunch y postres artesanales para reuniones y visitas de trabajo.',
            phone: '+1 809-555-7788',
            whatsapp: '+1 809-555-8899',
            website: 'https://cafedelbarrio.do',
            email: 'hola@cafedelbarrio.do',
            address: 'Calle Central 18, Naco',
            provinceId: 'province-id',
            cityId: 'city-id',
            sectorId: 'sector-id',
            categoryIds: ['cat-1'],
            featureIds: ['delivery'],
            imageCount: 3,
        });

        expect(guidance.blockedByLocalHeuristics).toBe(false);
        expect(guidance.readinessLevel).toBe('ALTA');
        expect(guidance.readinessScore).toBeGreaterThanOrEqual(80);
        expect(guidance.preventiveSeverity).toBe('LOW');
        expect(guidance.missingCriticalFields).toEqual([]);
        expect(guidance.visibilityChecks.every((item) => item.passed)).toBe(true);
    });
});
