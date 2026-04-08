import type React from 'react';
import { Link } from 'react-router-dom';
import { getDisplayInitial, renderStarsSafe } from './helpers';
import type { ReviewEntry, ReviewFormState } from './types';

interface ReviewsSectionProps {
    averageRating: string | null;
    averageRatingNumber: number | null;
    isAuthenticated: boolean;
    isCustomerRole: boolean;
    onReviewFormChange: React.Dispatch<React.SetStateAction<ReviewFormState>>;
    onSubmit: (event: React.FormEvent) => void;
    reviewCount: number;
    reviewErrorMessage: string;
    reviewForm: ReviewFormState;
    reviews: ReviewEntry[];
    reviewsLoading: boolean;
    reviewStarsLabel: string | null;
    reviewSuccessMessage: string;
    submittingReview: boolean;
}

const STAR_SYMBOL = String.fromCharCode(9733);

export function ReviewsSection({
    averageRating,
    averageRatingNumber,
    isAuthenticated,
    isCustomerRole,
    onReviewFormChange,
    onSubmit,
    reviewCount,
    reviewErrorMessage,
    reviewForm,
    reviews,
    reviewsLoading,
    reviewStarsLabel,
    reviewSuccessMessage,
    submittingReview,
}: ReviewsSectionProps) {
    return (
        <div className="panel-premium p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resenas</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">
                        Opiniones ({reviewCount})
                    </h2>
                </div>
                {averageRatingNumber ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-amber-900">
                        <div className="font-display text-2xl font-semibold leading-none">{averageRating}</div>
                        {reviewStarsLabel ? (
                            <div className="mt-1 text-[11px] tracking-[0.18em] text-amber-500">{reviewStarsLabel}</div>
                        ) : null}
                        <div className="mt-1 text-[11px] font-medium text-amber-700">
                            {reviewCount} resena{reviewCount === 1 ? '' : 's'}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="mt-5">
                {!isAuthenticated && (
                    <div className="mb-6 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
                        Inicia sesion para dejar tu resena. <Link to="/login" className="font-medium underline">Ir a login</Link>
                    </div>
                )}

                {isAuthenticated && !isCustomerRole && (
                    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Las resenas estan habilitadas solo para cuentas tipo cliente.
                    </div>
                )}

                {isAuthenticated && isCustomerRole && (
                    <form onSubmit={onSubmit} className="mb-6 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5">
                        <p className="mb-3 text-sm leading-relaxed text-slate-600">
                            Comparte una experiencia concreta para ayudar a otros usuarios a decidir con mas contexto.
                        </p>
                        <div className="mb-3 flex items-center gap-3">
                            <span className="text-sm font-medium text-slate-600">Tu calificacion:</span>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => onReviewFormChange((previous) => ({ ...previous, rating: star }))}
                                        aria-label={`Seleccionar ${star} estrellas`}
                                        className={`text-[1.75rem] leading-none transition-transform hover:scale-110 ${
                                            star <= reviewForm.rating ? 'text-amber-400' : 'text-slate-300'
                                        }`}
                                    >
                                        {STAR_SYMBOL}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            value={reviewForm.comment}
                            onChange={(event) => onReviewFormChange((previous) => ({ ...previous, comment: event.target.value }))}
                            placeholder="Escribe tu experiencia..."
                            className="input-field mt-1 text-sm"
                            rows={4}
                        />
                        <button type="submit" disabled={submittingReview} className="btn-primary mt-4 text-sm">
                            {submittingReview ? 'Enviando...' : 'Enviar resena'}
                        </button>
                    </form>
                )}

                {reviewErrorMessage && (
                    <div className="alert-danger mb-4 rounded-[1.25rem]">
                        {reviewErrorMessage}
                    </div>
                )}

                {reviewSuccessMessage && (
                    <div className="alert-info mb-4 rounded-[1.25rem]">
                        {reviewSuccessMessage}
                    </div>
                )}

                <div className="space-y-4">
                    {reviewsLoading ? (
                        <p className="py-4 text-center text-sm text-slate-500">Cargando resenas...</p>
                    ) : reviews.map((review) => (
                        <article key={review.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                                        {getDisplayInitial(review.user.name)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900">{review.user.name}</p>
                                        <div className="mt-1 text-xs tracking-[0.18em] text-amber-500">
                                            {renderStarsSafe(review.rating)}
                                        </div>
                                    </div>
                                </div>
                                <span className="shrink-0 text-xs text-slate-500">
                                    {new Date(review.createdAt).toLocaleDateString('es-DO')}
                                </span>
                            </div>
                            {review.comment ? (
                                <p className="mt-4 text-sm leading-6 text-slate-700">{review.comment}</p>
                            ) : (
                                <p className="mt-4 text-sm leading-6 text-slate-500">Sin comentario adicional.</p>
                            )}
                        </article>
                    ))}
                    {!reviewsLoading && reviews.length === 0 && (
                        <p className="py-4 text-center text-sm text-slate-500">
                            Aun no hay resenas. Se el primero en compartir tu experiencia.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
