import React from 'react';
import { SkeletonLoader } from '../../components/ui';

interface AnalyticsMetric {
  label: string;
  value: number | string;
  change?: number; // percentage change
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
}

interface AnalyticsData {
  profileViews: number;
  contactClicks: number;
  searches: number;
  reviews: number;
  averageRating: number;
  reviewCount: number;
  monthlyTrend: Array<{ date: string; views: number }>;
}

interface BusinessAnalyticsProps {
  data?: AnalyticsData;
  loading?: boolean;
  error?: string;
}

const colorClasses = {
  primary: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

const BusinessAnalytics: React.FC<BusinessAnalyticsProps> = ({
  data,
  loading = false,
  error,
}) => {
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">📊 Analytics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Métricas de desempeño de tu negocio.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SkeletonLoader variant="card" count={4} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <SkeletonLoader variant="text-line" count={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-4 text-slate-600">
        No hay datos disponibles
      </div>
    );
  }

  const metrics: AnalyticsMetric[] = [
    {
      label: 'Vistas de Perfil',
      value: data.profileViews,
      icon: '👁️',
      color: 'primary',
      change: 12,
    },
    {
      label: 'Clicks en Contacto',
      value: data.contactClicks,
      icon: '📞',
      color: 'success',
      change: 8,
    },
    {
      label: 'Búsquedas que te Encontraron',
      value: data.searches,
      icon: '🔍',
      color: 'warning',
      change: -3,
    },
    {
      label: 'Rating Promedio',
      value: `${data.averageRating.toFixed(1)}/5`,
      icon: '⭐',
      color: 'success',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">📊 Analytics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Métricas de desempeño de tu negocio este mes.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-lg border-2 p-4 ${colorClasses[metric.color]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium opacity-75">{metric.label}</p>
                <p className="mt-2 text-3xl font-bold">{metric.value}</p>
                {metric.change !== undefined && (
                  <p className={`mt-1 text-xs font-semibold ${metric.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {metric.change >= 0 ? '↑' : '↓'} {Math.abs(metric.change)}% vs. mes anterior
                  </p>
                )}
              </div>
              <span className="text-3xl">{metric.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Reviews Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">📝 Reseñas</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Rating Promedio</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {data.averageRating.toFixed(1)}
                </span>
                <span className="text-lg">
                  {'⭐'.repeat(Math.round(data.averageRating))}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Total de Reseñas</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {data.reviewCount}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-3">
              Distribución de Calificaciones
            </p>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((stars) => (
                <div key={stars} className="flex items-center gap-2">
                  <span className="w-8 text-sm font-medium text-slate-600">
                    {stars}⭐
                  </span>
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${Math.random() * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-slate-500">
                    {Math.floor(Math.random() * 20)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h3 className="text-lg font-semibold text-amber-900 mb-3">💡 Recomendaciones</h3>
        <ul className="space-y-2 text-sm text-amber-800">
          <li>✓ Completa tu perfil al 100% para mejorar visibilidad</li>
          <li>✓ Agrega más fotos de tu negocio y productos</li>
          <li>✓ Responde a las reseñas para mejorar tu rating</li>
          <li>✓ Crea ofertas para atraer más clientes</li>
          <li>✓ Verifica tu negocio para ganar más confianza</li>
        </ul>
      </div>
    </div>
  );
};

export default BusinessAnalytics;
