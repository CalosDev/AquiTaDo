interface TrustScoreProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

function TrustScore({
  score,
  showLabel = true,
  size = 'md',
  className = '',
  animated = false,
}: TrustScoreProps) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));

  const getTone = (value: number) => {
    if (value < 34) {
      return {
        text: 'text-rose-700',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        label: 'Baja',
        description: 'Confianza baja. Faltan señales suficientes para validar la ficha.',
      };
    }

    if (value < 67) {
      return {
        text: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        label: 'Media',
        description: 'Confianza media. La ficha tiene señales útiles, pero aún puede reforzarse.',
      };
    }

    return {
      text: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      label: 'Alta',
      description: 'Confianza alta. La ficha combina buenas señales de verificación y contexto.',
    };
  };

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
  };

  const tone = getTone(safeScore);

  return (
    <div
      className={`inline-flex items-center gap-3 ${className}`}
      title={tone.description}
      aria-label={`Puntuacion de confianza ${safeScore} de 100. Nivel ${tone.label}.`}
    >
      <div
        className={`inline-flex items-center justify-center rounded-full border-2 font-bold ${sizeClasses[size]} ${tone.bg} ${tone.border} ${tone.text} ${
          animated ? 'motion-safe:animate-pulse' : ''
        }`}
      >
        {safeScore}
      </div>

      {showLabel ? (
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${tone.text}`}>Confianza {tone.label}</p>
          <p className="text-xs text-slate-500">{safeScore}/100</p>
        </div>
      ) : null}
    </div>
  );
}

export default TrustScore;
