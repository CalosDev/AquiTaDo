import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { analyticsApi, businessApi, messagingApi, reviewApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';

interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    verified: boolean;
    province?: { name: string };
    city?: { name: string };
    images: { id: string; url: string }[];
    categories?: { category: { name: string; icon?: string } }[];
    features?: { feature: { name: string } }[];
    reviews?: { id: string; rating: number; comment?: string; user: { name: string }; createdAt: string }[];
    _count?: { reviews: number };
    owner?: { name: string };
}

function resolveVisitorId(): string {
    const existingVisitorId = localStorage.getItem('analyticsVisitorId');
    if (existingVisitorId) {
        return existingVisitorId;
    }

    const generatedVisitorId = window.crypto?.randomUUID?.() ?? `visitor-${Date.now()}`;
    localStorage.setItem('analyticsVisitorId', generatedVisitorId);
    return generatedVisitorId;
}

export function BusinessDetails() {
    const { id } = useParams<{ id: string }>();
    const { isAuthenticated } = useAuth();
    const [business, setBusiness] = useState<Business | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeImage, setActiveImage] = useState(0);
    const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
    const [submittingReview, setSubmittingReview] = useState(false);
    const [messageForm, setMessageForm] = useState({ subject: '', content: '' });
    const [sendingMessage, setSendingMessage] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [reviewErrorMessage, setReviewErrorMessage] = useState('');
    const [reviewSuccessMessage, setReviewSuccessMessage] = useState('');
    const [messageErrorMessage, setMessageErrorMessage] = useState('');
    const [messageSuccessMessage, setMessageSuccessMessage] = useState('');

    const loadBusiness = useCallback(async () => {
        if (!id) {
            setLoading(false);
            return;
        }

        try {
            const res = await businessApi.getById(id);
            setBusiness(res.data);
            setErrorMessage('');
        } catch (error) {
            setBusiness(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el negocio'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void loadBusiness();
    }, [loadBusiness]);

    useEffect(() => {
        if (!business?.id) {
            return;
        }

        const visitorId = resolveVisitorId();
        void analyticsApi.trackEvent({
            businessId: business.id,
            eventType: 'VIEW',
            visitorId,
        }).catch(() => undefined);
    }, [business?.id]);

    const handleReviewSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        setSubmittingReview(true);
        setReviewErrorMessage('');
        setReviewSuccessMessage('');
        try {
            await reviewApi.create({
                rating: reviewForm.rating,
                comment: reviewForm.comment || undefined,
                businessId: id,
            });
            setReviewForm({ rating: 5, comment: '' });
            await loadBusiness();
            setReviewSuccessMessage('Reseña publicada correctamente');
        } catch (error) {
            setReviewErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la reseña'));
        } finally {
            setSubmittingReview(false);
        }
    };

    const handleMessageSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!id || !messageForm.content.trim()) {
            setMessageErrorMessage('Escribe un mensaje para el negocio');
            return;
        }

        setSendingMessage(true);
        setMessageErrorMessage('');
        setMessageSuccessMessage('');

        try {
            await messagingApi.createConversation({
                businessId: id,
                subject: messageForm.subject.trim() || undefined,
                message: messageForm.content.trim(),
            });
            setMessageForm({ subject: '', content: '' });
            setMessageSuccessMessage('Mensaje enviado correctamente');
            void analyticsApi.trackEvent({
                businessId: id,
                eventType: 'RESERVATION_REQUEST',
                visitorId: resolveVisitorId(),
            }).catch(() => undefined);
        } catch (error) {
            setMessageErrorMessage(getApiErrorMessage(error, 'No se pudo enviar el mensaje'));
        } finally {
            setSendingMessage(false);
        }
    };

    const averageRating =
        business?.reviews && business.reviews.length > 0
            ? (business.reviews.reduce((acc, r) => acc + r.rating, 0) / business.reviews.length).toFixed(1)
            : null;

    if (loading) {
        return (
            <div className="flex justify-center py-32">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!business) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-4">
                <p className="text-5xl">😕</p>
                <h2 className="text-2xl font-bold text-gray-900">Negocio no encontrado</h2>
                {errorMessage && (
                    <p className="text-sm text-red-600">{errorMessage}</p>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {errorMessage && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Image Gallery */}
                    <div className="card overflow-hidden">
                        <div className="h-72 md:h-96 bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center">
                            {business.images.length > 0 ? (
                                <img
                                    src={business.images[activeImage]?.url}
                                    alt={business.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-7xl">🏪</span>
                            )}
                        </div>
                        {business.images.length > 1 && (
                            <div className="flex gap-2 p-3 overflow-x-auto">
                                {business.images.map((img, i) => (
                                    <button
                                        key={img.id}
                                        onClick={() => setActiveImage(i)}
                                        className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${i === activeImage ? 'border-primary-500' : 'border-transparent'
                                            }`}
                                    >
                                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="card p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    {business.verified && (
                                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                            ✓ Verificado
                                        </span>
                                    )}
                                    <div className="flex gap-1">
                                        {business.categories?.map((bc, i) => (
                                            <span key={i} className="bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {bc.category.icon} {bc.category.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <h1 className="font-display text-3xl font-bold text-gray-900">{business.name}</h1>
                                <p className="text-gray-500 mt-1 flex items-center gap-1">
                                    📍 {business.address}
                                    {business.province && ` — ${business.province.name}`}
                                    {business.city && `, ${business.city.name}`}
                                </p>
                            </div>
                            {averageRating && (
                                <div className="text-center bg-accent-50 px-4 py-2 rounded-xl">
                                    <div className="text-2xl font-bold text-accent-600">⭐ {averageRating}</div>
                                    <div className="text-xs text-gray-500">{business._count?.reviews} reseñas</div>
                                </div>
                            )}
                        </div>

                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">{business.description}</p>

                        {/* Features */}
                        {business.features && business.features.length > 0 && (
                            <div className="mt-6">
                                <h3 className="font-display font-semibold text-gray-900 mb-3">Características</h3>
                                <div className="flex flex-wrap gap-2">
                                    {business.features.map((bf, i) => (
                                        <span key={i} className="px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                                            ✔️ {bf.feature.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Map */}
                    {business.latitude && business.longitude && (
                        <div className="card p-6">
                            <h3 className="font-display font-semibold text-gray-900 mb-3">Ubicación</h3>
                            <div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center">
                                <iframe
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0, borderRadius: '0.75rem' }}
                                    loading="lazy"
                                    src={`https://maps.google.com/maps?q=${business.latitude},${business.longitude}&z=15&output=embed`}
                                    allowFullScreen
                                ></iframe>
                            </div>
                        </div>
                    )}

                    {/* Reviews */}
                    <div className="card p-6">
                        <h3 className="font-display font-semibold text-gray-900 mb-4">
                            Reseñas ({business.reviews?.length || 0})
                        </h3>

                        {/* Review Form */}
                        {!isAuthenticated && (
                            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                                Inicia sesión para dejar tu reseña. <Link to="/login" className="underline font-medium">Ir a login</Link>
                            </div>
                        )}

                        {isAuthenticated && (
                            <form onSubmit={handleReviewSubmit} className="mb-6 p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-sm font-medium text-gray-600">Tu calificación:</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                                                className={`text-2xl transition-transform hover:scale-110 ${star <= reviewForm.rating ? 'text-yellow-400' : 'text-gray-300'
                                                    }`}
                                            >
                                                ★
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <textarea
                                    value={reviewForm.comment}
                                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                                    placeholder="Escribe tu experiencia..."
                                    className="input-field text-sm mb-3"
                                    rows={3}
                                />
                                <button
                                    type="submit"
                                    disabled={submittingReview}
                                    className="btn-primary text-sm"
                                >
                                    {submittingReview ? 'Enviando...' : 'Enviar Reseña'}
                                </button>
                            </form>
                        )}

                        {reviewErrorMessage && (
                            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {reviewErrorMessage}
                            </div>
                        )}

                        {reviewSuccessMessage && (
                            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                {reviewSuccessMessage}
                            </div>
                        )}

                        {/* Reviews List */}
                        <div className="space-y-4">
                            {business.reviews?.map((review) => (
                                <div key={review.id} className="p-4 border border-gray-100 rounded-xl">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <span className="font-semibold text-gray-900">{review.user.name}</span>
                                            <div className="flex gap-0.5 mt-0.5">
                                                {Array.from({ length: 5 }, (_, i) => (
                                                    <span key={i} className={`text-sm ${i < review.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                                                ))}
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {new Date(review.createdAt).toLocaleDateString('es-DO')}
                                        </span>
                                    </div>
                                    {review.comment && <p className="text-sm text-gray-600">{review.comment}</p>}
                                </div>
                            ))}
                            {(!business.reviews || business.reviews.length === 0) && (
                                <p className="text-gray-400 text-sm text-center py-4">
                                    Aún no hay reseñas. ¡Sé el primero en opinar!
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar - Contact */}
                <div className="space-y-6">
                    <div className="card p-6 sticky top-20">
                        <h3 className="font-display font-semibold text-gray-900 mb-4">Contacto</h3>
                        <div className="space-y-3">
                            {business.phone && (
                                <a
                                    href={`tel:${business.phone}`}
                                    onClick={() => {
                                        void analyticsApi.trackEvent({
                                            businessId: business.id,
                                            eventType: 'CLICK',
                                            visitorId: resolveVisitorId(),
                                        }).catch(() => undefined);
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-primary-50 transition-colors group"
                                >
                                    <span className="text-lg">📞</span>
                                    <div>
                                        <div className="text-xs text-gray-400">Teléfono</div>
                                        <div className="text-sm font-medium text-gray-700 group-hover:text-primary-700">{business.phone}</div>
                                    </div>
                                </a>
                            )}
                            {business.whatsapp && (
                                <a
                                    href={`https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => {
                                        void analyticsApi.trackEvent({
                                            businessId: business.id,
                                            eventType: 'CLICK',
                                            visitorId: resolveVisitorId(),
                                        }).catch(() => undefined);
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors group"
                                >
                                    <span className="text-lg">💬</span>
                                    <div>
                                        <div className="text-xs text-gray-400">WhatsApp</div>
                                        <div className="text-sm font-medium text-green-700">{business.whatsapp}</div>
                                    </div>
                                </a>
                            )}
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                                <span className="text-lg">📍</span>
                                <div>
                                    <div className="text-xs text-gray-400">Dirección</div>
                                    <div className="text-sm text-gray-700">{business.address}</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-gray-100 pt-6">
                            <h4 className="font-display font-semibold text-gray-900 mb-3">
                                Mensaje directo
                            </h4>

                            {!isAuthenticated && (
                                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                                    Inicia sesión para enviar un mensaje.{' '}
                                    <Link to="/login" className="underline font-medium">Ir a login</Link>
                                </div>
                            )}

                            {isAuthenticated && (
                                <form onSubmit={handleMessageSubmit} className="space-y-3">
                                    <input
                                        className="input-field text-sm"
                                        placeholder="Asunto (opcional)"
                                        value={messageForm.subject}
                                        onChange={(event) =>
                                            setMessageForm((previous) => ({
                                                ...previous,
                                                subject: event.target.value,
                                            }))
                                        }
                                    />
                                    <textarea
                                        className="input-field text-sm"
                                        rows={3}
                                        placeholder="Escribe tu consulta..."
                                        value={messageForm.content}
                                        onChange={(event) =>
                                            setMessageForm((previous) => ({
                                                ...previous,
                                                content: event.target.value,
                                            }))
                                        }
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={sendingMessage}
                                    >
                                        {sendingMessage ? 'Enviando...' : 'Enviar mensaje'}
                                    </button>
                                </form>
                            )}

                            {messageErrorMessage && (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {messageErrorMessage}
                                </div>
                            )}

                            {messageSuccessMessage && (
                                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                    {messageSuccessMessage}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
