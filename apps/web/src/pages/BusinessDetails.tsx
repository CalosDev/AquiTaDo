import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { analyticsApi, businessApi, favoritesApi, messagingApi, reviewApi, whatsappApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';
import { OptimizedImage } from '../components/OptimizedImage';
import { getOrAssignExperimentVariant } from '../lib/abTesting';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { applySeoMeta, removeJsonLd, upsertJsonLd } from '../seo/meta';

interface Business {
    id: string;
    name: string;
    slug: string;
    createdAt?: string;
    updatedAt?: string;
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

function formatDaysAgo(value?: string): string | null {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)));
    if (days === 0) {
        return 'Actualizado hoy';
    }
    if (days === 1) {
        return 'Actualizado hace 1 dia';
    }
    return `Actualizado hace ${days} dias`;
}

export function BusinessDetails() {
    const { slug } = useParams<{ slug: string }>();
    const { isAuthenticated, user } = useAuth();
    const isCustomerRole = user?.role === 'USER';
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
    const [contactVariant, setContactVariant] = useState('control');
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [favoriteProcessing, setFavoriteProcessing] = useState(false);
    const [favoriteLists, setFavoriteLists] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [newListName, setNewListName] = useState('');
    const [listProcessing, setListProcessing] = useState(false);
    const [favoriteInfoMessage, setFavoriteInfoMessage] = useState('');
    const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');

    const loadBusiness = useCallback(async () => {
        if (!slug) {
            setLoading(false);
            return;
        }

        try {
            const res = await businessApi.getByIdentifier(slug);
            setBusiness(res.data);
            setActiveImage(0);
            setErrorMessage('');
        } catch (error) {
            setBusiness(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el negocio'));
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        void loadBusiness();
    }, [loadBusiness]);

    useEffect(() => {
        if (!business?.id) {
            return;
        }

        const visitorId = getOrCreateVisitorId();
        setContactVariant(
            getOrAssignExperimentVariant(
                'business_contact_button',
                ['control', 'emphasis'],
                business.id,
            ),
        );
        void analyticsApi.trackEvent({
            businessId: business.id,
            eventType: 'VIEW',
            visitorId,
        }).catch(() => undefined);
    }, [business?.id]);

    useEffect(() => {
        if (!business?.id || !isAuthenticated || !isCustomerRole) {
            setIsFavorite(false);
            setFavoriteLists([]);
            setSelectedListId('');
            return;
        }

        let active = true;
        setFavoriteLoading(true);
        setFavoriteErrorMessage('');

        void Promise.all([
            favoritesApi.getFavoriteBusinesses({
                businessId: business.id,
                limit: 1,
            }),
            favoritesApi.getMyLists({ limit: 30 }),
        ])
            .then(([favoritesResponse, listsResponse]) => {
                if (!active) {
                    return;
                }

                const hasFavorite = ((favoritesResponse.data?.data ?? []) as Array<unknown>).length > 0;
                const loadedLists = ((listsResponse.data?.data ?? []) as Array<{ id: string; name: string }>);

                setIsFavorite(hasFavorite);
                setFavoriteLists(loadedLists);
                setSelectedListId((previous) => previous || loadedLists[0]?.id || '');
            })
            .catch((error) => {
                if (!active) {
                    return;
                }
                setFavoriteErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar tus favoritos'));
            })
            .finally(() => {
                if (active) {
                    setFavoriteLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [business?.id, isAuthenticated, isCustomerRole]);

    useEffect(() => {
        if (!business) {
            removeJsonLd('business-details');
            return;
        }

        const canonicalPath = `/businesses/${business.slug || business.id}`;
        const description = business.description?.trim().slice(0, 160) || `Perfil de ${business.name} en AquiTa.do`;
        const averageRatingValue =
            business.reviews && business.reviews.length > 0
                ? Number(
                    (
                        business.reviews.reduce((accumulator, review) => accumulator + review.rating, 0)
                        / business.reviews.length
                    ).toFixed(1),
                )
                : null;
        applySeoMeta({
            title: `${business.name} | AquiTa.do`,
            description,
            canonicalPath,
        });

        upsertJsonLd('business-details', {
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: business.name,
            description,
            image: business.images?.[0]?.url,
            telephone: business.phone || undefined,
            url: `${window.location.origin}${canonicalPath}`,
            address: {
                '@type': 'PostalAddress',
                streetAddress: business.address,
                addressLocality: business.city?.name || undefined,
                addressRegion: business.province?.name || undefined,
                addressCountry: 'DO',
            },
            geo: (typeof business.latitude === 'number' && typeof business.longitude === 'number')
                ? {
                    '@type': 'GeoCoordinates',
                    latitude: business.latitude,
                    longitude: business.longitude,
                }
                : undefined,
            aggregateRating: business._count?.reviews
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: averageRatingValue ?? undefined,
                    reviewCount: business._count.reviews,
                }
                : undefined,
        });
    }, [business]);

    const handleReviewSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!business?.id) return;
        setSubmittingReview(true);
        setReviewErrorMessage('');
        setReviewSuccessMessage('');
        try {
            await reviewApi.create({
                rating: reviewForm.rating,
                comment: reviewForm.comment || undefined,
                businessId: business.id,
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
        if (!business?.id || !messageForm.content.trim()) {
            setMessageErrorMessage('Escribe un mensaje para el negocio');
            return;
        }

        setSendingMessage(true);
        setMessageErrorMessage('');
        setMessageSuccessMessage('');

        try {
            await messagingApi.createConversation({
                businessId: business.id,
                subject: messageForm.subject.trim() || undefined,
                message: messageForm.content.trim(),
            });
            setMessageForm({ subject: '', content: '' });
            setMessageSuccessMessage('Mensaje enviado correctamente');
            void analyticsApi.trackEvent({
                businessId: business.id,
                eventType: 'RESERVATION_REQUEST',
                visitorId: getOrCreateVisitorId(),
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
    const updatedLabel = formatDaysAgo(business?.updatedAt);
    const memberSinceYear = business?.createdAt
        ? new Date(business.createdAt).getFullYear()
        : null;
    const currentImage = business?.images?.[activeImage] ?? business?.images?.[0];
    const contactExperimentVariant = `business_contact_button:${contactVariant}`;
    const whatsappDirectUrl = business?.whatsapp
        ? `https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`
        : null;

    const trackContactGrowthEvent = (
        eventType: 'CONTACT_CLICK' | 'WHATSAPP_CLICK',
        metadata: Record<string, unknown>,
    ) => {
        if (!business?.id) {
            return;
        }

        void analyticsApi.trackGrowthEvent({
            eventType,
            businessId: business.id,
            visitorId: getOrCreateVisitorId(),
            sessionId: getOrCreateSessionId(),
            variantKey: contactExperimentVariant,
            metadata,
        }).catch(() => undefined);
    };

    const handlePhoneClick = () => {
        if (!business?.id) {
            return;
        }

        const visitorId = getOrCreateVisitorId();
        void analyticsApi.trackEvent({
            businessId: business.id,
            eventType: 'CLICK',
            visitorId,
        }).catch(() => undefined);

        trackContactGrowthEvent('CONTACT_CLICK', {
            source: 'business-details',
            channel: 'phone',
        });
    };

    const openWhatsApp = async () => {
        if (!business?.id || !business.whatsapp) {
            return;
        }

        const visitorId = getOrCreateVisitorId();
        const sessionId = getOrCreateSessionId();

        void analyticsApi.trackEvent({
            businessId: business.id,
            eventType: 'CLICK',
            visitorId,
        }).catch(() => undefined);

        trackContactGrowthEvent('CONTACT_CLICK', {
            source: 'business-details',
            channel: 'whatsapp',
        });

        try {
            const response = await whatsappApi.createClickToChatLink({
                businessId: business.id,
                source: 'business-details',
                sessionId,
                visitorId,
                variantKey: contactExperimentVariant,
            });

            trackContactGrowthEvent('WHATSAPP_CLICK', {
                source: 'business-details',
                channel: 'whatsapp',
                conversionId: response.data?.conversionId ?? null,
            });

            const url = response.data?.url || whatsappDirectUrl;
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } catch {
            if (whatsappDirectUrl) {
                window.open(whatsappDirectUrl, '_blank', 'noopener,noreferrer');
                return;
            }
            setErrorMessage('No se pudo abrir WhatsApp');
        }
    };

    const handleWhatsAppClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        void openWhatsApp();
    };

    const handleToggleFavorite = async () => {
        if (!business?.id || !isAuthenticated || !isCustomerRole) {
            return;
        }

        setFavoriteProcessing(true);
        setFavoriteErrorMessage('');
        setFavoriteInfoMessage('');

        try {
            const response = await favoritesApi.toggleFavoriteBusiness({ businessId: business.id });
            const nextFavoriteState = Boolean(response.data?.favorite);
            setIsFavorite(nextFavoriteState);
            setFavoriteInfoMessage(nextFavoriteState ? 'Negocio guardado en favoritos' : 'Negocio removido de favoritos');
        } catch (error) {
            setFavoriteErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar favoritos'));
        } finally {
            setFavoriteProcessing(false);
        }
    };

    const handleCreateList = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newListName.trim()) {
            setFavoriteErrorMessage('Escribe el nombre de la lista');
            return;
        }

        setListProcessing(true);
        setFavoriteErrorMessage('');
        setFavoriteInfoMessage('');

        try {
            const response = await favoritesApi.createList({ name: newListName.trim() });
            const createdList = response.data as { id: string; name: string };
            setFavoriteLists((previous) => [createdList, ...previous]);
            setSelectedListId(createdList.id);
            setNewListName('');
            setFavoriteInfoMessage('Lista creada correctamente');
        } catch (error) {
            setFavoriteErrorMessage(getApiErrorMessage(error, 'No se pudo crear la lista'));
        } finally {
            setListProcessing(false);
        }
    };

    const handleAddToList = async () => {
        if (!business?.id || !selectedListId) {
            setFavoriteErrorMessage('Selecciona una lista');
            return;
        }

        setListProcessing(true);
        setFavoriteErrorMessage('');
        setFavoriteInfoMessage('');

        try {
            await favoritesApi.addBusinessToList(selectedListId, { businessId: business.id });
            setFavoriteInfoMessage('Negocio agregado a la lista');
        } catch (error) {
            setFavoriteErrorMessage(getApiErrorMessage(error, 'No se pudo agregar a la lista'));
        } finally {
            setListProcessing(false);
        }
    };

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 lg:pb-8 animate-fade-in">
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
                            {currentImage ? (
                                <OptimizedImage
                                    src={currentImage.url}
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
                                        <OptimizedImage
                                            src={img.url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
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
                                        <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium border border-primary-200">
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
                                <div className="text-center bg-accent-50 border border-accent-100 px-4 py-2 rounded-xl">
                                    <div className="text-2xl font-bold text-accent-600">⭐ {averageRating}</div>
                                    <div className="text-xs text-gray-500">{business._count?.reviews} reseñas</div>
                                </div>
                            )}
                        </div>

                        <p className="text-gray-700 leading-relaxed whitespace-pre-line">{business.description}</p>

                        {isAuthenticated && isCustomerRole && (
                            <div className="mt-5 rounded-xl border border-primary-100 p-4 bg-primary-50/30 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleToggleFavorite()}
                                        disabled={favoriteProcessing || favoriteLoading}
                                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                            isFavorite
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                                        }`}
                                    >
                                        {favoriteProcessing
                                            ? 'Guardando...'
                                            : isFavorite
                                                ? 'Guardado en favoritos'
                                                : 'Guardar en favoritos'}
                                    </button>
                                    {favoriteInfoMessage && (
                                        <span className="text-xs text-green-700">{favoriteInfoMessage}</span>
                                    )}
                                    {favoriteErrorMessage && (
                                        <span className="text-xs text-red-700">{favoriteErrorMessage}</span>
                                    )}
                                </div>

                                {favoriteLists.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            className="input-field text-sm max-w-xs"
                                            value={selectedListId}
                                            onChange={(event) => setSelectedListId(event.target.value)}
                                        >
                                            <option value="">Selecciona lista</option>
                                            {favoriteLists.map((list) => (
                                                <option key={list.id} value={list.id}>
                                                    {list.name}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleAddToList()}
                                            disabled={listProcessing || !selectedListId}
                                        >
                                            {listProcessing ? 'Procesando...' : 'Agregar a lista'}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">Crea una lista para organizar tus negocios favoritos.</p>
                                )}

                                <form onSubmit={handleCreateList} className="flex flex-wrap items-center gap-2">
                                    <input
                                        className="input-field text-sm max-w-xs"
                                        placeholder="Nueva lista"
                                        value={newListName}
                                        onChange={(event) => setNewListName(event.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={listProcessing}
                                    >
                                        {listProcessing ? 'Creando...' : 'Crear lista'}
                                    </button>
                                </form>
                            </div>
                        )}

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
                    {typeof business.latitude === 'number' && typeof business.longitude === 'number' && (
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
                            <div className="mb-6 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
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
                    <div className="card p-6 lg:sticky lg:top-24 border-t-4 border-accent-600">
                        <h3 className="font-display font-semibold text-gray-900 mb-4">Contacto</h3>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {business.verified && (
                                <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                                    Verificado
                                </span>
                            )}
                            {updatedLabel && (
                                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                                    {updatedLabel}
                                </span>
                            )}
                            {memberSinceYear && Number.isFinite(memberSinceYear) && (
                                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                                    En AquiTa.do desde {memberSinceYear}
                                </span>
                            )}
                        </div>
                        <div className="space-y-3">
                            {business.phone && (
                                <a
                                    href={`tel:${business.phone}`}
                                    onClick={handlePhoneClick}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-primary-50/50 hover:bg-primary-100 transition-colors hover-lift group"
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
                                    href={whatsappDirectUrl ?? '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={handleWhatsAppClick}
                                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors hover-lift group ${contactVariant === 'emphasis'
                                        ? 'bg-green-100 hover:bg-green-200 border border-green-300 shadow-sm'
                                        : 'bg-green-50 hover:bg-green-100'
                                        }`}
                                >
                                    <span className="text-lg">💬</span>
                                    <div>
                                        <div className="text-xs text-gray-400">WhatsApp</div>
                                        <div className="text-sm font-medium text-green-700">
                                            {contactVariant === 'emphasis' ? 'Chatea ahora' : business.whatsapp}
                                        </div>
                                    </div>
                                </a>
                            )}
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-50/40 border border-primary-100">
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
                                <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
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

            {(business.phone || business.whatsapp) && (
                <div className="fixed inset-x-4 bottom-4 z-40 lg:hidden">
                    <div className="rounded-2xl border border-primary-100 bg-white/95 backdrop-blur shadow-xl p-2 flex gap-2">
                        {business.phone && (
                            <a
                                href={`tel:${business.phone}`}
                                onClick={handlePhoneClick}
                                className="flex-1 touch-target rounded-xl bg-primary-600 text-white text-sm font-semibold flex items-center justify-center"
                            >
                                Llamar
                            </a>
                        )}
                        {business.whatsapp && (
                            <button
                                type="button"
                                onClick={() => void openWhatsApp()}
                                className="flex-1 touch-target rounded-xl bg-green-600 text-white text-sm font-semibold"
                            >
                                WhatsApp
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
