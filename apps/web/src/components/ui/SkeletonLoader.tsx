import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'card' | 'list-item' | 'text-line' | 'image' | 'badge' | 'radar-item' | 'sponsored-card' | 'details-item';
  count?: number;
  className?: string;
  animated?: boolean;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'text-line',
  count = 1,
  className = '',
  animated = true,
}) => {
  const pulseClass = animated ? 'animate-pulse' : '';

  const renderSkeleton = (index: number) => {
    switch (variant) {
      case 'card':
        return (
          <div
            key={`skeleton-card-${index}`}
            className={`listing-card overflow-hidden p-0 ${className}`}
            aria-hidden="true"
            role="status"
          >
            <div className={`listing-card-media h-48 bg-slate-100 ${pulseClass}`}></div>
            <div className="space-y-3 p-5">
              <div className={`h-6 w-2/3 rounded-full bg-slate-100 ${pulseClass}`}></div>
              <div className={`h-3.5 w-1/2 rounded-full bg-slate-100 ${pulseClass}`}></div>
              <div className={`h-3.5 w-full rounded-full bg-slate-100 ${pulseClass}`}></div>
              <div className={`h-3.5 w-5/6 rounded-full bg-slate-100 ${pulseClass}`}></div>
            </div>
          </div>
        );
      case 'list-item':
        return (
          <div
            key={`skeleton-list-${index}`}
            className={`flex items-center space-x-4 p-4 border-b border-slate-100 ${className}`}
            aria-hidden="true"
            role="status"
          >
            <div className={`h-12 w-12 rounded-md bg-slate-100 ${pulseClass}`}></div>
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-1/4 rounded bg-slate-100 ${pulseClass}`}></div>
              <div className={`h-3 w-3/4 rounded bg-slate-100 ${pulseClass}`}></div>
            </div>
          </div>
        );
      case 'radar-item':
        return (
          <div
            key={`skeleton-radar-${index}`}
            className={`hero-radar-item !cursor-default !justify-between ${className}`}
            aria-hidden="true"
            role="status"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white/70 ${pulseClass}`}>
                {index + 1}
              </span>
              <span className={`h-3.5 w-32 rounded-full bg-white/20 ${pulseClass}`}></span>
            </div>
            <span className={`h-3.5 w-12 rounded-full bg-white/15 ${pulseClass}`}></span>
          </div>
        );
      case 'sponsored-card':
        return (
          <div
            key={`skeleton-sponsored-${index}`}
            className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}
            aria-hidden="true"
            role="status"
          >
            <div className={`h-3 w-24 rounded-full bg-slate-100 ${pulseClass}`} />
            <div className={`mt-3 h-5 w-2/3 rounded-full bg-slate-100 ${pulseClass}`} />
            <div className={`mt-2 h-4 w-3/4 rounded-full bg-slate-100 ${pulseClass}`} />
          </div>
        );
      case 'details-item':
        return (
          <div
            key={`skeleton-details-${index}`}
            className={`rounded-2xl border border-slate-200 p-4 ${className}`}
            aria-hidden="true"
            role="status"
          >
            <div className={`h-4 w-1/2 rounded-full bg-slate-100 ${pulseClass}`}></div>
            <div className={`mt-3 h-3.5 w-full rounded-full bg-slate-100 ${pulseClass}`}></div>
            <div className={`mt-2 h-3.5 w-4/5 rounded-full bg-slate-100 ${pulseClass}`}></div>
          </div>
        );
      case 'image':
        return (
          <div
            key={`skeleton-image-${index}`}
            className={`bg-slate-100 rounded-lg ${pulseClass} ${className}`}
            aria-hidden="true"
            role="status"
          ></div>
        );
      case 'badge':
        return (
          <div
            key={`skeleton-badge-${index}`}
            className={`h-6 w-20 rounded-full bg-slate-100 ${pulseClass} ${className}`}
            aria-hidden="true"
            role="status"
          ></div>
        );
      case 'text-line':
      default:
        return (
          <div
            key={`skeleton-text-${index}`}
            className={`h-4 w-full rounded bg-slate-100 ${pulseClass} ${className}`}
            aria-hidden="true"
            role="status"
          ></div>
        );
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => renderSkeleton(index))}
    </>
  );
};

export default SkeletonLoader;
