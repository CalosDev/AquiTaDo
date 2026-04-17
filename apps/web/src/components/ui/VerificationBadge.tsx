type VerificationStatus = 'verified' | 'unverified' | 'pending';

interface VerificationBadgeProps {
  status: VerificationStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

function VerificationBadge({
  status,
  size = 'md',
  className = '',
  showTooltip = true,
}: VerificationBadgeProps) {
  const statusConfig = {
    verified: {
      label: 'Verificado',
      description: 'Este negocio fue verificado por AquiTa.do.',
      dotClass: 'bg-emerald-500',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    unverified: {
      label: 'No verificado',
      description: 'Este negocio aun no completa verificacion.',
      dotClass: 'bg-slate-400',
      toneClass: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    pending: {
      label: 'Pendiente',
      description: 'La verificacion esta en proceso.',
      dotClass: 'bg-amber-500',
      toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    },
  } as const;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-sm gap-2',
    lg: 'px-4 py-2 text-base gap-2.5',
  };

  const dotSizes = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClasses[size]} ${config.toneClass} ${className}`}
      title={showTooltip ? config.description : undefined}
      aria-label={config.label}
    >
      <span className={`rounded-full ${dotSizes[size]} ${config.dotClass}`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}

export default VerificationBadge;
