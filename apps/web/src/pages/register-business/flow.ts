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
        detail: 'Una propuesta clara ayuda a que la ficha se vea seria, util y facil de entender.',
    },
    2: {
        title: 'Aqui dejas tu mejor canal de contacto',
        detail: 'WhatsApp, telefono o website bien puestos hacen que la ficha sirva desde el primer dia.',
    },
    3: {
        title: 'La ubicacion decide donde apareces',
        detail: 'Direccion, provincia y ciudad ayudan a ubicarte mejor en la zona correcta y en el mapa.',
    },
    4: {
        title: 'Ahora dejas lista la presentacion final',
        detail: 'Categorias, horarios e imagenes ayudan a que la ficha se vea completa y confiable antes de publicar.',
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
            'Direccion, provincia y ciudad ayudan a que te encuentren mejor por zona.',
            'Mientras mas precisa la ubicacion, mas facil sera ubicarte en lista y mapa.',
        ];
    }
    return [
        'La categoria define donde apareces y los horarios ayudan a mostrar si estas abierto.',
        'Antes de publicar, revisa el bloque final para corregir pendientes visibles.',
    ];
}
