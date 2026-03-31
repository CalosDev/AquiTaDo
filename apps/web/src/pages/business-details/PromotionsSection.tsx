import { formatCurrencyDop } from './helpers';
import type { PublicPromotion } from './types';

interface PromotionsSectionProps {
    loading: boolean;
    promotions: PublicPromotion[];
}

export function PromotionsSection({ loading, promotions }: PromotionsSectionProps) {
    return (
        <div className="panel-premium p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Promociones</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">Ofertas activas</h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {promotions.length} activa{promotions.length === 1 ? '' : 's'}
                </span>
            </div>
            <div className="mt-5">
                {loading ? (
                    <p className="text-sm text-slate-500">Cargando promociones...</p>
                ) : promotions.length > 0 ? (
                    <div className="space-y-3">
                        {promotions.map((promotion) => (
                            <div key={promotion.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-slate-900">{promotion.title}</p>
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                        {promotion.discountType === 'PERCENTAGE'
                                            ? `${Number(promotion.discountValue)}% OFF`
                                            : `${formatCurrencyDop(Number(promotion.discountValue))} OFF`}
                                    </span>
                                </div>
                                {promotion.description ? (
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{promotion.description}</p>
                                ) : null}
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    {promotion.couponCode ? (
                                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                                            Cupon: {promotion.couponCode}
                                        </span>
                                    ) : null}
                                    {promotion.isFlashOffer ? (
                                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">
                                            Flash
                                        </span>
                                    ) : null}
                                    <span>Vence: {new Date(promotion.endsAt).toLocaleDateString('es-DO')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                        <div className="text-3xl">Tag</div>
                        <p className="mt-3 text-sm font-medium text-slate-700">
                            Este negocio no tiene promociones activas ahora mismo.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                            Cuando haya nuevas ofertas, apareceran aqui.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
