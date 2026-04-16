import React, { useState } from 'react';

interface TrustScoreProps {
  score: number; // 0-100
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

const TrustScore: React.FC<TrustScoreProps> = ({
  score,
  showLabel = true,
  size = 'md',
  className = '',
  animated = true,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine color based on score
  const getScoreColor = (s: number) => {
    if (s < 34) return 'text-red-600 bg-red-50';
    if (s < 67) return 'text-amber-600 bg-amber-50';
    return 'text-green-600 bg-green-50';
  };

  const getScoreBorderColor = (s: number) => {
    if (s < 34) return 'border-red-200';
    if (s < 67) return 'border-amber-200';
    return 'border-green-200';
  };

  const getScoreLabel = (s: number) => {
    if (s < 34) return 'Bajo';
    if (s < 67) return 'Medio';
    return 'Alto';
  };

  const getScoreDescription = (s: number) => {
    if (s < 34) return 'Confianza baja. Pocos datos disponibles.';
    if (s < 67) return 'Confianza media. Algunos datos verificados.';
    return 'Confianza alta. Datos verificados y reseñas positivas.';
  };

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-16 w-16 text-lg',
  };

  const colorClasses = getScoreColor(score);
  const borderColorClass = getScoreBorderColor(score);
  const label = getScoreLabel(score);
  const description = getScoreDescription(score);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <div
        className={`relative flex items-center justify-center rounded-full border-2 font-bold transition ${sizeClasses[size]} ${colorClasses} ${borderColorClass} ${
          animated ? 'animate-pulse' : ''
        }`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        role="status"
        aria-label={`Puntuación de confianza: ${score} de 100`}
      >
        {score}
      </div>

      {showLabel && (
        <div className="ml-3 flex flex-col">
          <span className={`text-xs font-semibold ${getScoreColor(score).split(' ')[0]}`}>
            {label}
          </span>
          <span className="text-xs text-slate-600">{score}/100</span>
        </div>
      )}

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 transform rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg whitespace-nowrap">
          {description}
          <div className="absolute top-full left-1/2 -translate-x-1/2 transform border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

export default TrustScore;
