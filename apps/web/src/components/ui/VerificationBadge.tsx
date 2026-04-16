import React, { useState } from 'react';

type VerificationStatus = 'verified' | 'unverified' | 'pending';

interface VerificationBadgeProps {
  status: VerificationStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  status,
  size = 'md',
  className = '',
  showTooltip = true,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const statusConfig = {
    verified: {
      icon: '✅',
      label: 'Verificado',
      description: 'Este negocio ha sido verificado por AquiTa.do',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
    },
    unverified: {
      icon: '⚪',
      label: 'No verificado',
      description: 'Este negocio aún no ha sido verificado',
      bgColor: 'bg-slate-50',
      textColor: 'text-slate-600',
      borderColor: 'border-slate-200',
    },
    pending: {
      icon: '⏳',
      label: 'Pendiente',
      description: 'Verificación en proceso',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      borderColor: 'border-amber-200',
    },
  };

  const config = statusConfig[status];

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  };

  return (
    <div className="relative inline-block">
      <div
        className={`inline-flex items-center rounded-full border ${sizeClasses[size]} ${config.bgColor} ${config.textColor} ${config.borderColor} font-medium transition ${className}`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        role="status"
        aria-label={config.label}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </div>

      {showTooltip && isHovering && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 transform rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg whitespace-nowrap">
          {config.description}
          <div className="absolute top-full left-1/2 -translate-x-1/2 transform border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

export default VerificationBadge;
