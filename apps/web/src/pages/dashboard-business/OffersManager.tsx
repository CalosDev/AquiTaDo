import React, { useState } from 'react';
import { SkeletonLoader } from '../../components/ui';

interface Offer {
  id: string;
  title: string;
  description: string;
  discount?: number;
  code?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

interface OffersManagerProps {
  offers: Offer[];
  loading?: boolean;
  onCreateOffer?: (offer: Omit<Offer, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateOffer?: (id: string, offer: Partial<Offer>) => Promise<void>;
  onDeleteOffer?: (id: string) => Promise<void>;
}

const OffersManager: React.FC<OffersManagerProps> = ({
  offers,
  loading = false,
  onCreateOffer,
  onUpdateOffer,
  onDeleteOffer,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    discount: 0,
    code: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingId && onUpdateOffer) {
        await onUpdateOffer(editingId, formData);
      } else if (onCreateOffer) {
        await onCreateOffer({
          ...formData,
          isActive: true,
        });
      }
      resetForm();
    } catch (error) {
      console.error('Error al guardar oferta:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (offer: Offer) => {
    setFormData({
      title: offer.title,
      description: offer.description,
      discount: offer.discount || 0,
      code: offer.code || '',
      startDate: offer.startDate.split('T')[0],
      endDate: offer.endDate.split('T')[0],
    });
    setEditingId(offer.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta oferta?')) {
      try {
        await onDeleteOffer?.(id);
      } catch (error) {
        console.error('Error al eliminar oferta:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      discount: 0,
      code: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const isOfferActive = (offer: Offer) => {
    const today = new Date().toISOString().split('T')[0];
    return offer.isActive && offer.startDate <= today && offer.endDate >= today;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">🎁 Gestor de Ofertas</h2>
          <p className="mt-1 text-sm text-slate-600">
            Crea y gestiona ofertas para atraer más clientes.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            + Nueva Oferta
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            {editingId ? 'Editar Oferta' : 'Crear Nueva Oferta'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Título de la Oferta *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej: 20% de descuento en pizzas"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe los detalles de la oferta"
                rows={3}
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descuento (%)
                </label>
                <input
                  type="number"
                  value={formData.discount}
                  onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
                  min="0"
                  max="100"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Código (opcional)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ej: VERANO20"
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de Inicio *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de Fin *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? 'Guardando...' : 'Guardar Oferta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Offers List */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Mis Ofertas ({offers.length})
        </h3>

        {loading ? (
          <div className="space-y-3">
            <SkeletonLoader variant="card" count={3} />
          </div>
        ) : offers.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-slate-600">
              No tienes ofertas activas. Crea una para atraer más clientes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {offers.map((offer) => {
              const active = isOfferActive(offer);
              return (
                <div
                  key={offer.id}
                  className={`rounded-lg border-2 p-4 transition ${
                    active
                      ? 'border-green-200 bg-green-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 truncate">
                          {offer.title}
                        </h4>
                        {active && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                            ✅ Activa
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {offer.description}
                      </p>
                    </div>

                    {(offer.discount ?? 0) > 0 && (
                      <div className="flex items-center justify-center rounded-lg bg-primary-100 px-3 py-2">
                        <span className="text-lg font-bold text-primary-700">
                          {offer.discount}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <div>
                      <p>
                        📅 {new Date(offer.startDate).toLocaleDateString('es-DO')} -{' '}
                        {new Date(offer.endDate).toLocaleDateString('es-DO')}
                      </p>
                      {offer.code && (
                        <p className="mt-1">
                          Código: <span className="font-mono font-semibold">{offer.code}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(offer)}
                        className="rounded px-2 py-1 text-primary-600 hover:bg-primary-50 transition"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(offer.id)}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50 transition"
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OffersManager;
