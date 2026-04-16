import React from 'react';
import { Link } from 'react-router-dom';
import { SkeletonLoader } from '../../components/ui';

interface RadarTrend {
  id: string;
  name: string;
  slug?: string;
  count: number;
  trend: number; // percentage change
  icon?: string;
}

interface RadarLocalSectionProps {
  loading: boolean;
  trends: RadarTrend[];
  error?: string;
  onCategoryClick?: (categoryId: string) => void;
}

const RadarLocalSection: React.FC<RadarLocalSectionProps> = ({
  loading,
  trends,
  error,
  onCategoryClick,
}) => {
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return '📈';
    if (trend < 0) return '📉';
    return '➡️';
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">📡 Radar Local</h3>
        <p className="mt-1 text-sm text-slate-600">
          Tendencias de búsqueda y categorías más activas esta semana.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonLoader variant="list-item" count={4} />
        </div>
      ) : trends.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">
            No hay datos de tendencias disponibles en este momento.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trends.map((trend, index) => (
            <Link
              key={trend.id}
              to={trend.slug ? `/negocios/categoria/${trend.slug}` : `/businesses?categoryId=${trend.id}`}
              onClick={() => onCategoryClick?.(trend.id)}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-primary-300 hover:bg-primary-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{trend.icon || '🏪'}</span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {index + 1}. {trend.name}
                  </p>
                  <p className="text-xs text-slate-500">{trend.count} negocios</p>
                </div>
              </div>
              <div className={`flex items-center gap-1 whitespace-nowrap text-sm font-semibold ${getTrendColor(trend.trend)}`}>
                <span>{getTrendIcon(trend.trend)}</span>
                <span>{trend.trend > 0 ? '+' : ''}{trend.trend}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default RadarLocalSection;
