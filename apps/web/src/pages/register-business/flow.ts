export type RegisterStep = 1 | 2 | 3 | 4;

export const REGISTER_STEP_TITLES: Array<{ step: RegisterStep; title: string; subtitle: string }> = [
    { step: 1, title: 'Informacion', subtitle: 'Nombre y propuesta' },
    { step: 2, title: 'Contacto', subtitle: 'Telefono y WhatsApp' },
    { step: 3, title: 'Ubicacion', subtitle: 'Direccion y mapa' },
    { step: 4, title: 'Categorias y servicios', subtitle: 'Donde apareceras y como operas' },
];

const STEP_PRIMARY_ACTION_LABEL: Record<RegisterStep, string> = {
    1: 'Guardar informacion y seguir',
    2: 'Guardar contacto y seguir',
    3: 'Confirmar ubicacion y seguir',
    4: 'Publicar negocio',
};

const STEP_UNLOCK_SUMMARY: Record<RegisterStep, { title: string; detail: string }> = {
    1: {
        title: 'Este paso define como se entiende tu negocio',
        detail: 'Una propuesta clara mejora discovery y evita que la ficha parezca promocion vacia o spam.',
    },
    2: {
        title: 'Aqui dejas el canal que convierte',
        detail: 'WhatsApp, telefono o website bien puestos reducen rebote y mejoran la utilidad de la ficha desde el dia uno.',
    },
    3: {
        title: 'La ubicacion decide donde apareces',
        detail: 'Direccion, provincia y ciudad alimentan geocodificacion, resultados cercanos y la vista de mapa.',
    },
    4: {
        title: 'Ahora cierras visibilidad y operacion',
        detail: 'Categorias, horarios e imagenes empujan confianza y mejoran el filtro de discovery antes de publicar.',
    },
};

export const TOTAL_REGISTER_STEPS = REGISTER_STEP_TITLES.length;

export function getRegisterStepActionLabel(step: RegisterStep): string {
    return STEP_PRIMARY_ACTION_LABEL[step];
}

export function getRegisterStepUnlock(step: RegisterStep): { title: string; detail: string } {
    return STEP_UNLOCK_SUMMARY[step];
}

export function getRegisterStepTips(step: RegisterStep): string[] {
    if (step === 1) {
        return [
            'Explica que vendes, en que zona operas y por que alguien deberia elegirte.',
            'No pongas telefonos, links ni WhatsApp dentro de la descripcion.',
        ];
    }
    if (step === 2) {
        return [
            'Completa al menos un canal de contacto util desde el dia uno.',
            'Si usas WhatsApp como canal principal, dejalo en su campo estructurado.',
        ];
    }
    if (step === 3) {
        return [
            'Direccion, provincia y ciudad mejoran discovery local y geocodificacion.',
            'Mientras mas precisa la ubicacion, mejor responde lista/mapa.',
        ];
    }
    return [
        'La categoria define donde apareces; los horarios alimentan filtros como "abierto ahora".',
        'Antes de publicar, revisa el bloque de visibilidad y riesgo preventivo.',
    ];
}
