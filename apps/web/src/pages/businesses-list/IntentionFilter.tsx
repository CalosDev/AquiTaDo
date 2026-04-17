interface IntentionOption {
  id: string;
  label: string;
  description: string;
}

interface IntentionFilterProps {
  selectedIntentions: string[];
  onIntentionChange: (intentionId: string, selected: boolean) => void;
  className?: string;
}

const INTENTION_OPTIONS: IntentionOption[] = [
  {
    id: 'con-delivery',
    label: 'Con delivery',
    description: 'Negocios que ofrecen delivery',
  },
  {
    id: 'pet-friendly',
    label: 'Pet friendly',
    description: 'Negocios que aceptan mascotas',
  },
  {
    id: 'con-parqueo',
    label: 'Con parqueo',
    description: 'Negocios con estacionamiento',
  },
  {
    id: 'con-reservas',
    label: 'Con reservas',
    description: 'Negocios que aceptan reservaciones',
  },
  {
    id: 'abierto-ahora',
    label: 'Abierto ahora',
    description: 'Negocios abiertos en este momento',
  },
  {
    id: 'verificado',
    label: 'Verificado',
    description: 'Negocios verificados por la plataforma',
  },
  {
    id: 'accesible-ada',
    label: 'Accesible',
    description: 'Negocios accesibles para personas con discapacidad',
  },
  {
    id: 'acepta-tarjeta',
    label: 'Acepta tarjeta',
    description: 'Negocios que aceptan tarjetas de credito',
  },
  {
    id: 'wifi-gratis',
    label: 'WiFi gratis',
    description: 'Negocios con WiFi gratuito',
  },
];

function IntentionFilter({
  selectedIntentions,
  onIntentionChange,
  className = '',
}: IntentionFilterProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">Intenciones de busqueda</h3>
      <div className="flex flex-wrap gap-2">
        {INTENTION_OPTIONS.map((intention) => {
          const isSelected = selectedIntentions.includes(intention.id);
          return (
            <button
              key={intention.id}
              type="button"
              onClick={() => onIntentionChange(intention.id, !isSelected)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isSelected
                  ? 'border-primary-300 bg-primary-100 text-primary-700'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-50'
              }`}
              title={intention.description}
              aria-pressed={isSelected}
            >
              <span>{intention.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default IntentionFilter;
