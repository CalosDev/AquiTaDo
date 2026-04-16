import React from 'react';

interface IntentionOption {
  id: string;
  label: string;
  icon: string;
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
    icon: '🚗',
    description: 'Negocios que ofrecen delivery',
  },
  {
    id: 'pet-friendly',
    label: 'Pet friendly',
    icon: '🐾',
    description: 'Negocios que aceptan mascotas',
  },
  {
    id: 'con-parqueo',
    label: 'Con parqueo',
    icon: '🅿️',
    description: 'Negocios con estacionamiento',
  },
  {
    id: 'con-reservas',
    label: 'Con reservas',
    icon: '📅',
    description: 'Negocios que aceptan reservaciones',
  },
  {
    id: 'abierto-ahora',
    label: 'Abierto ahora',
    icon: '🕐',
    description: 'Negocios abiertos en este momento',
  },
  {
    id: 'verificado',
    label: 'Verificado',
    icon: '✅',
    description: 'Negocios verificados por la plataforma',
  },
  {
    id: 'accesible-ada',
    label: 'Accesible (ADA)',
    icon: '♿',
    description: 'Negocios accesibles para personas con discapacidad',
  },
  {
    id: 'acepta-tarjeta',
    label: 'Acepta tarjeta',
    icon: '💳',
    description: 'Negocios que aceptan tarjetas de crédito',
  },
  {
    id: 'wifi-gratis',
    label: 'WiFi gratis',
    icon: '📶',
    description: 'Negocios con WiFi gratuito',
  },
];

const IntentionFilter: React.FC<IntentionFilterProps> = ({
  selectedIntentions,
  onIntentionChange,
  className = '',
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">Intenciones de búsqueda</h3>
      <div className="flex flex-wrap gap-2">
        {INTENTION_OPTIONS.map((intention) => {
          const isSelected = selectedIntentions.includes(intention.id);
          return (
            <button
              key={intention.id}
              onClick={() => onIntentionChange(intention.id, !isSelected)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                isSelected
                  ? 'bg-primary-100 text-primary-700 border border-primary-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
              title={intention.description}
              aria-pressed={isSelected}
            >
              <span>{intention.icon}</span>
              <span>{intention.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default IntentionFilter;
