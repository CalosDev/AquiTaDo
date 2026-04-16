import React from 'react';
import { Link } from 'react-router-dom';
import { SkeletonLoader, TrustScore, VerificationBadge } from '../../components/ui';
import { OptimizedImage } from '../../components/OptimizedImage';

interface RecentBusiness {
  id: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  province?: { name: string };
  images: { url: string }[];
  verified?: boolean;
  reputation?: {
    score: number;
    averageRating: number;
    reviewCount: number;
  };
}

interface RecentBusinessesSectionProps {
  loading: boolean;
  businesses: RecentBusiness[];
  error?: string;
  onBusinessClick?: (businessId: string) => void;
}

const RecentBusinessesSection: React.FC<RecentBusinessesSectionProps> = ({
  loading,
  businesses,
  error,
  onBusinessClick,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">✨ Negocios Recientes</h3>
        <p className="mt-1 text-sm text-slate-600">
          Perfiles nuevos listos para recibir clientes.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonLoader variant="card" count={3} />
        </div>
      ) : businesses.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">
            Aún no hay negocios registrados. Sé el primero en aportar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <Link
              key={business.id}
              to={`/businesses/${business.slug || business.id}`}
              onClick={() => onBusinessClick?.(business.id)}
              className="group overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-primary-300 hover:shadow-md"
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden bg-slate-100">
                {business.images && business.images.length > 0 ? (
                  <OptimizedImage
                    src={business.images[0].url}
                    alt={business.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                    <span className="text-3xl">🏪</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900 truncate">{business.name}</h4>
                    <p className="text-xs text-slate-500 truncate">
                      {business.province?.name || 'República Dominicana'}
                    </p>
                  </div>
                  {business.verified && (
                    <VerificationBadge status="verified" size="sm" showTooltip={false} />
                  )}
                </div>

                {/* Description */}
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                  {business.description || 'Sin descripción disponible'}
                </p>

                {/* Address */}
                <p className="mt-2 line-clamp-1 text-xs text-slate-500">
                  📍 {business.address || 'Ubicación no disponible'}
                </p>

                {/* Reputation */}
                {business.reputation && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        ⭐ {business.reputation.averageRating.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({business.reputation.reviewCount})
                      </span>
                    </div>
                    <TrustScore score={business.reputation.score} showLabel={false} size="sm" />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentBusinessesSection;
