import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { analyticsApi, bookingsApi, businessApi, checkinsApi, favoritesApi, messagingApi, promotionsApi, reputationApi, reviewApi, whatsappApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';
import { OptimizedImage } from '../components/OptimizedImage';
import { getOrAssignExperimentVariant } from '../lib/abTesting';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { calculateBusinessTrustScore } from '../lib/trust';
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
    reputationScore?: number | string | null;
    province?: { name: string };
    city?: { name: string };
    images: { id: string; url: string }[];
    categories?: { category: { name: string; icon?: string } }[];
    features?: { feature: { name: string } }[];
    reviews?: { id: string; rating: number; comment?: string; user: { name: string }; createdAt: string }[];
    _count?: { reviews: number };
    owner?: { name: string };
}

interface ReviewEntry {
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
    };
}

interface PublicPromotion {
    id: string;
    title: string;
    description?: string | null;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: string | number;
    couponCode?: string | null;
    endsAt: string;
    isFlashOffer?: boolean;
}

interface NearbyBusiness {
    id: string;
    name: string;
    slug: string;
    address?: string;
    distance?: number | string | null;
}

interface CheckInStats {
    businessId: string;
    totalCheckIns: number;
    last24HoursCheckIns: number;
    verifiedCheckIns: number;
    uniqueUsers: number;
}

interface ReputationProfile {
    business: {
        id: string;
        reputationScore: number;
        reputationTier: 'BRONZE' | 'SILVER' | 'GOLD';
        verified: boolean;
        verifiedAt?: string | null;
    };
    metrics: {
        averageRating: number;
        reviewCount: number;
        bookings: {
            completed: number;
            confirmed: number;
            pending: number;
            canceled: number;
            noShow: number;
        };
        successfulTransactions: number;
        grossRevenue: number;
    };
}

async function getCurrentLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return null;
    }

    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) =>
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }),
            () => resolve(null),
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 60_000,
            },
        );
    });
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

function tierLabel(tier: 'BRONZE' | 'SILVER' | 'GOLD'): string {
    if (tier === 'GOLD') {
        return 'Oro';
    }
    if (tier === 'SILVER') {
        return 'Plata';
    }
    return 'Bronce';
}

function formatCurrencyDop(value: number): string {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        maximumFractionDigits: 0,
    }).format(value);
}

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function businessSupportsBooking(features?: { feature: { name: string } }[]): boolean {
    if (!features || features.length === 0) {
        return false;
    }

    return features.some((entry) => {
        const normalized = normalizeText(entry.feature.name);
        return (
            normalized.includes('reservacion')
            || normalized.includes('reserva')
            || normalized.includes('cita')
            || normalized.includes('appointment')
        );
    });
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
    const [bookingForm, setBookingForm] = useState({
        scheduledFor: '',
        partySize: '2',
        notes: '',
    });
    const [submittingBooking, setSubmittingBooking] = useState(false);
    const [publicLeadForm, setPublicLeadForm] = useState({
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        message: '',
    });
    const [submittingPublicLead, setSubmittingPublicLead] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [reviewErrorMessage, setReviewErrorMessage] = useState('');
    const [reviewSuccessMessage, setReviewSuccessMessage] = useState('');
    const [messageErrorMessage, setMessageErrorMessage] = useState('');
    const [messageSuccessMessage, setMessageSuccessMessage] = useState('');
    const [bookingErrorMessage, setBookingErrorMessage] = useState('');
    const [bookingSuccessMessage, setBookingSuccessMessage] = useState('');
    const [publicLeadErrorMessage, setPublicLeadErrorMessage] = useState('');
    const [publicLeadSuccessMessage, setPublicLeadSuccessMessage] = useState('');
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
    const [checkInStats, setCheckInStats] = useState<CheckInStats | null>(null);
    const [checkInStatsLoading, setCheckInStatsLoading] = useState(false);
    const [checkInProcessing, setCheckInProcessing] = useState(false);
    const [checkInInfoMessage, setCheckInInfoMessage] = useState('');
    const [checkInErrorMessage, setCheckInErrorMessage] = useState('');
    const [reputationProfile, setReputationProfile] = useState<ReputationProfile | null>(null);
    const [reputationLoading, setReputationLoading] = useState(false);
    const [reviews, setReviews] = useState<ReviewEntry[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [publicPromotions, setPublicPromotions] = useState<PublicPromotion[]>([]);
    const [promotionsLoading, setPromotionsLoading] = useState(false);
    const [nearbyBusinesses, setNearbyBusinesses] = useState<NearbyBusiness[]>([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);

    const loadBusiness = useCallback(async () => {
        if (!slug) {
            setLoading(false);
            return;
        }

        try {
            let res;
            try {
                res = await businessApi.getBySlug(slug);
            } catch {
                res = await businessApi.getByIdentifier(slug);
            }
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

    const loadCheckInStats = useCallback(async () => {
        if (!business?.id) {
            setCheckInStats(null);
            return;
        }

        setCheckInStatsLoading(true);
        try {
            const response = await checkinsApi.getBusinessStats(business.id);
            setCheckInStats(response.data as CheckInStats);
        } catch {
            setCheckInStats(null);
        } finally {
            setCheckInStatsLoading(false);
        }
    }, [business?.id]);

    useEffect(() => {
        void loadCheckInStats();
    }, [loadCheckInStats]);

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

    useEffect(() => {
        if (!business?.id) {
            setReputationProfile(null);
            return;
        }

        let active = true;
        setReputationLoading(true);

        void reputationApi.getBusinessProfile(business.id)
            .then((response) => {
                if (!active) {
                    return;
                }
                setReputationProfile(response.data as ReputationProfile);
            })
            .catch(() => {
                if (!active) {
                    return;
                }
                setReputationProfile(null);
            })
            .finally(() => {
                if (active) {
                    setReputationLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [business?.id]);

    useEffect(() => {
        if (!business?.id) {
            setReviews([]);
            setPublicPromotions([]);
            setNearbyBusinesses([]);
            return;
        }

        let active = true;
        setReviewsLoading(true);
        setPromotionsLoading(true);
        setNearbyLoading(Boolean(
            typeof business.latitude === 'number' && typeof business.longitude === 'number',
        ));

        void reviewApi.getByBusiness(business.id)
            .then((response) => {
                if (!active) {
                    return;
                }
                setReviews((response.data || []) as ReviewEntry[]);
            })
            .catch(() => {
                if (active) {
                    setReviews([]);
                }
            })
            .finally(() => {
                if (active) {
                    setReviewsLoading(false);
                }
            });

        void promotionsApi.getPublic({
            businessId: business.id,
            limit: 6,
        })
            .then((response) => {
                if (!active) {
                    return;
                }

                const payload = response.data;
                const rows = Array.isArray(payload)
                    ? payload
                    : ((payload?.data || []) as PublicPromotion[]);
                setPublicPromotions(rows as PublicPromotion[]);
            })
            .catch(() => {
                if (active) {
                    setPublicPromotions([]);
                }
            })
            .finally(() => {
                if (active) {
                    setPromotionsLoading(false);
                }
            });

        if (
            typeof business.latitude === 'number'
            && typeof business.longitude === 'number'
        ) {
            void businessApi.getNearby({
                lat: business.latitude,
                lng: business.longitude,
                radius: 5,
            })
                .then((response) => {
                    if (!active) {
                        return;
                    }

                    const payload = response.data;
                    const rows = (Array.isArray(payload)
                        ? payload
                        : (payload?.data || [])) as Array<Record<string, unknown>>;

                    const normalized = rows
                        .map((row) => ({
                            id: String(row.id || ''),
                            name: String(row.name || ''),
                            slug: String(row.slug || ''),
                            address: typeof row.address === 'string' ? row.address : undefined,
                            distance: typeof row.distance === 'number' || typeof row.distance === 'string'
                                ? row.distance
                                : null,
                        }))
                        .filter((item) => item.id && item.id !== business.id)
                        .slice(0, 6);

                    setNearbyBusinesses(normalized);
                })
                .catch(() => {
                    if (active) {
                        setNearbyBusinesses([]);
                    }
                })
                .finally(() => {
                    if (active) {
                        setNearbyLoading(false);
                    }
                });
        } else {
            setNearbyBusinesses([]);
            setNearbyLoading(false);
        }

        return () => {
            active = false;
        };
    }, [business?.id, business?.latitude, business?.longitude]);

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
            setReviewSuccessMessage('Resena publicada correctamente');
        } catch (error) {
            setReviewErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la resena'));
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

    const visibleReviews = reviews.length > 0 ? reviews : (business?.reviews ?? []);
    const reviewCount = business?._count?.reviews ?? visibleReviews.length;
    const averageRating =
        visibleReviews.length > 0
            ? (visibleReviews.reduce((acc, r) => acc + r.rating, 0) / visibleReviews.length).toFixed(1)
            : null;
    const averageRatingNumber = averageRating ? Number(averageRating) : null;
    const trust = calculateBusinessTrustScore({
        verified: business?.verified,
        reputationScore: business?.reputationScore,
        averageRating: averageRatingNumber,
        reviewsCount: reviewCount,
        hasPhone: Boolean(business?.phone),
        hasWhatsapp: Boolean(business?.whatsapp),
        hasDescription: Boolean(business?.description?.trim()),
        hasAddress: Boolean(business?.address?.trim()),
        hasImages: Boolean(business?.images?.length),
    });
    const updatedLabel = formatDaysAgo(business?.updatedAt);
    const memberSinceYear = business?.createdAt
        ? new Date(business.createdAt).getFullYear()
        : null;
    const currentImage = business?.images?.[activeImage] ?? business?.images?.[0];
    const mapCoordinates =
        typeof business?.latitude === 'number' && typeof business?.longitude === 'number'
            ? {
                lat: business.latitude,
                lng: business.longitude,
            }
            : null;
    const mapBounds = mapCoordinates
        ? `${mapCoordinates.lng - 0.01}%2C${mapCoordinates.lat - 0.01}%2C${mapCoordinates.lng + 0.01}%2C${mapCoordinates.lat + 0.01}`
        : null;
    const openStreetMapEmbedUrl = mapCoordinates && mapBounds
        ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds}&layer=mapnik&marker=${mapCoordinates.lat}%2C${mapCoordinates.lng}`
        : null;
    const googleMapsDirectionsUrl = mapCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${mapCoordinates.lat},${mapCoordinates.lng}`
        : null;
    const contactExperimentVariant = `business_contact_button:${contactVariant}`;
    const whatsappDirectUrl = business?.whatsapp
        ? `https://wa.me/${business.whatsapp.replace(/[^0-9]/g, '')}`
        : null;
    const canBookThisBusiness = businessSupportsBooking(business?.features);

    const trackContactGrowthEvent = (
        eventType: 'CONTACT_CLICK' | 'WHATSAPP_CLICK' | 'BOOKING_INTENT',
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

    const handlePublicLeadSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!business?.id) {
            return;
        }

        if (!publicLeadForm.contactName.trim() || !publicLeadForm.contactPhone.trim() || !publicLeadForm.message.trim()) {
            setPublicLeadErrorMessage('Nombre, telefono y mensaje son obligatorios');
            return;
        }

        setSubmittingPublicLead(true);
        setPublicLeadErrorMessage('');
        setPublicLeadSuccessMessage('');

        try {
            await businessApi.createPublicLead(business.id, {
                contactName: publicLeadForm.contactName.trim(),
                contactPhone: publicLeadForm.contactPhone.trim(),
                contactEmail: publicLeadForm.contactEmail.trim() || undefined,
                message: publicLeadForm.message.trim(),
                preferredChannel: business.whatsapp ? 'WHATSAPP' : 'PHONE',
            });
            setPublicLeadForm({
                contactName: '',
                contactPhone: '',
                contactEmail: '',
                message: '',
            });
            setPublicLeadSuccessMessage('Solicitud enviada. Te contactaran pronto.');
            void analyticsApi.trackGrowthEvent({
                eventType: 'CONTACT_CLICK',
                businessId: business.id,
                visitorId: getOrCreateVisitorId(),
                sessionId: getOrCreateSessionId(),
                metadata: {
                    source: 'public-lead-form',
                },
            }).catch(() => undefined);
        } catch (error) {
            setPublicLeadErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la solicitud'));
        } finally {
            setSubmittingPublicLead(false);
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

    const handleBookingSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!business?.id) {
            return;
        }

        const scheduledFor = bookingForm.scheduledFor.trim();
        const partySize = Number.parseInt(bookingForm.partySize, 10);
        if (!scheduledFor) {
            setBookingErrorMessage('Selecciona fecha y hora para tu reserva');
            return;
        }

        if (!Number.isFinite(partySize) || partySize < 1) {
            setBookingErrorMessage('El tamano del grupo debe ser mayor a 0');
            return;
        }

        setSubmittingBooking(true);
        setBookingErrorMessage('');
        setBookingSuccessMessage('');
        try {
            await bookingsApi.create({
                businessId: business.id,
                scheduledFor: new Date(scheduledFor).toISOString(),
                partySize,
                notes: bookingForm.notes.trim() || undefined,
            });
            setBookingForm({
                scheduledFor: '',
                partySize: '2',
                notes: '',
            });
            setBookingSuccessMessage('Reserva enviada correctamente');
            void analyticsApi.trackEvent({
                businessId: business.id,
                eventType: 'RESERVATION_REQUEST',
                visitorId: getOrCreateVisitorId(),
            }).catch(() => undefined);
            trackContactGrowthEvent('BOOKING_INTENT', {
                source: 'business-details',
                channel: 'booking-form',
            });
        } catch (error) {
            setBookingErrorMessage(getApiErrorMessage(error, 'No se pudo crear la reserva'));
        } finally {
            setSubmittingBooking(false);
        }
    };

    const handleCreateCheckIn = async () => {
        if (!business?.id || !isAuthenticated || !isCustomerRole) {
            return;
        }

        setCheckInProcessing(true);
        setCheckInErrorMessage('');
        setCheckInInfoMessage('');

        try {
            const coordinates = await getCurrentLocation();
            const response = await checkinsApi.create({
                businessId: business.id,
                latitude: coordinates?.latitude,
                longitude: coordinates?.longitude,
            });

            const reward = response.data?.reward as
                | {
                    pointsAwarded?: number;
                    verifiedLocation?: boolean;
                    loyaltyTier?: string;
                    checkinStreak?: number;
                }
                | undefined;

            const pointsAwarded = Number(reward?.pointsAwarded ?? 0);
            const verifiedLabel = reward?.verifiedLocation ? ' con GPS verificado' : '';
            const streakLabel = reward?.checkinStreak ? ` - racha ${reward.checkinStreak}` : '';
            const tierLabel = reward?.loyaltyTier ? ` - tier ${reward.loyaltyTier}` : '';

            setCheckInInfoMessage(
                `Check-in registrado: +${pointsAwarded} pts${verifiedLabel}${streakLabel}${tierLabel}`,
            );
            await loadCheckInStats();
        } catch (error) {
            setCheckInErrorMessage(getApiErrorMessage(error, 'No se pudo registrar el check-in'));
        } finally {
            setCheckInProcessing(false);
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
                <p className="text-5xl">:(</p>
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
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Image Gallery */}
                    <div className="panel-premium overflow-hidden">
                        <div className="h-72 md:h-96 bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center">
                            {currentImage ? (
                                <OptimizedImage
                                    src={currentImage.url}
                                    alt={business.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-7xl">NEG</span>
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
                    <div className="panel-premium p-6 md:p-7">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    {business.verified && (
                                        <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium border border-primary-200">
                                            OK Verificado
                                        </span>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                        {business.categories?.map((bc, i) => (
                                            <span key={i} className="bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {bc.category.icon} {bc.category.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 leading-tight">{business.name}</h1>
                                <p className="text-gray-500 mt-2 flex items-center gap-1">
                                    Direccion: {business.address}
                                    {business.province && ` - ${business.province.name}`}
                                    {business.city && `, ${business.city.name}`}
                                </p>
                            </div>
                            {averageRating && (
                                <div className="text-center bg-accent-50 border border-accent-100 px-4 py-2 rounded-xl md:min-w-[110px]">
                                    <div className="text-2xl font-bold text-accent-600">* {averageRating}</div>
                                    <div className="text-xs text-gray-500">{business._count?.reviews} resenas</div>
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

                        <div className="mt-5 rounded-xl border border-accent-100 bg-accent-50/40 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="font-display font-semibold text-gray-900">Actividad local</h2>
                                {checkInStatsLoading ? (
                                    <span className="text-xs text-gray-500">Actualizando...</span>
                                ) : null}
                            </div>
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Check-ins</p>
                                    <p className="text-base font-semibold text-gray-900">
                                        {checkInStats?.totalCheckIns ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Ult 24h</p>
                                    <p className="text-base font-semibold text-gray-900">
                                        {checkInStats?.last24HoursCheckIns ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-gray-500">GPS verif.</p>
                                    <p className="text-base font-semibold text-gray-900">
                                        {checkInStats?.verifiedCheckIns ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Usuarios</p>
                                    <p className="text-base font-semibold text-gray-900">
                                        {checkInStats?.uniqueUsers ?? 0}
                                    </p>
                                </div>
                            </div>

                            {isAuthenticated && isCustomerRole ? (
                                <div className="mt-3 space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleCreateCheckIn()}
                                        disabled={checkInProcessing}
                                        className="btn-secondary text-sm"
                                    >
                                        {checkInProcessing ? 'Registrando...' : 'Hacer check-in y ganar puntos'}
                                    </button>
                                    {checkInInfoMessage ? (
                                        <p className="text-xs text-green-700">{checkInInfoMessage}</p>
                                    ) : null}
                                    {checkInErrorMessage ? (
                                        <p className="text-xs text-red-700">{checkInErrorMessage}</p>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="mt-3 text-xs text-gray-600">
                                    Inicia sesion como usuario para registrar check-ins y ganar puntos.
                                </p>
                            )}
                        </div>

                        {/* Features */}
                        {business.features && business.features.length > 0 && (
                            <div className="mt-6">
                                <h2 className="font-display font-semibold text-gray-900 mb-3">Caracteristicas</h2>
                                <div className="flex flex-wrap gap-2">
                                    {business.features.map((bf, i) => (
                                        <span key={i} className="px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                                            + {bf.feature.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Map */}
                    {openStreetMapEmbedUrl && (
                        <div className="panel-premium p-6">
                            <h2 className="font-display font-semibold text-gray-900 mb-3">Ubicacion</h2>
                            <div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center">
                                <iframe
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0, borderRadius: '0.75rem' }}
                                    loading="lazy"
                                    src={openStreetMapEmbedUrl}
                                    title={`Mapa de ubicacion de ${business.name}`}
                                    allowFullScreen
                                ></iframe>
                            </div>
                            {googleMapsDirectionsUrl && (
                                <a
                                    href={googleMapsDirectionsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex text-sm font-medium text-primary-700 hover:text-primary-800 underline underline-offset-2"
                                >
                                    Ver ruta en Google Maps
                                </a>
                            )}
                        </div>
                    )}

                    <div className="panel-premium p-6">
                        <h2 className="font-display font-semibold text-gray-900 mb-4">Ofertas activas</h2>
                        {promotionsLoading ? (
                            <p className="text-sm text-gray-500">Cargando promociones...</p>
                        ) : publicPromotions.length > 0 ? (
                            <div className="space-y-3">
                                {publicPromotions.map((promotion) => (
                                    <div key={promotion.id} className="rounded-xl border border-gray-100 bg-white p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-semibold text-gray-900">{promotion.title}</p>
                                            <span className="text-xs rounded-full bg-primary-50 text-primary-700 px-2 py-1">
                                                {promotion.discountType === 'PERCENTAGE'
                                                    ? `${Number(promotion.discountValue)}% OFF`
                                                    : `${formatCurrencyDop(Number(promotion.discountValue))} OFF`}
                                            </span>
                                        </div>
                                        {promotion.description ? (
                                            <p className="text-sm text-gray-600 mt-1">{promotion.description}</p>
                                        ) : null}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                            {promotion.couponCode ? (
                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                                                    Cupon: {promotion.couponCode}
                                                </span>
                                            ) : null}
                                            {promotion.isFlashOffer ? (
                                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                                                    Flash
                                                </span>
                                            ) : null}
                                            <span>Vence: {new Date(promotion.endsAt).toLocaleDateString('es-DO')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Este negocio no tiene promociones activas.</p>
                        )}
                    </div>

                    <div className="panel-premium p-6">
                        <h2 className="font-display font-semibold text-gray-900 mb-4">Negocios cerca de aqui</h2>
                        {nearbyLoading ? (
                            <p className="text-sm text-gray-500">Cargando negocios cercanos...</p>
                        ) : nearbyBusinesses.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {nearbyBusinesses.map((nearbyBusiness) => {
                                    const parsedDistance = Number(nearbyBusiness.distance);
                                    const distanceLabel = Number.isFinite(parsedDistance)
                                        ? `${parsedDistance.toFixed(1)} km`
                                        : null;
                                    return (
                                        <Link
                                            key={nearbyBusiness.id}
                                            to={`/businesses/${nearbyBusiness.slug || nearbyBusiness.id}`}
                                            className="rounded-xl border border-gray-100 bg-white p-3 hover:border-primary-200 hover:bg-primary-50/40 transition-colors"
                                        >
                                            <p className="font-medium text-gray-900">{nearbyBusiness.name}</p>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                {nearbyBusiness.address || 'Direccion no disponible'}
                                            </p>
                                            {distanceLabel ? (
                                                <p className="text-xs text-primary-700 mt-2">{distanceLabel}</p>
                                            ) : null}
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No hay resultados cercanos para mostrar.</p>
                        )}
                    </div>

                    {/* Reviews */}
                    <div className="panel-premium p-6">
                        <h2 className="font-display font-semibold text-gray-900 mb-4">
                            Resenas ({reviewCount})
                        </h2>

                        {/* Review Form */}
                        {!isAuthenticated && (
                            <div className="mb-6 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
                                Inicia sesion para dejar tu resena. <Link to="/login" className="underline font-medium">Ir a login</Link>
                            </div>
                        )}

                        {isAuthenticated && (
                            <form onSubmit={handleReviewSubmit} className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-sm font-medium text-gray-600">Tu calificacion:</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                                                className={`text-2xl transition-transform hover:scale-110 ${star <= reviewForm.rating ? 'text-yellow-400' : 'text-gray-300'
                                                    }`}
                                            >
                                                *
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
                                    {submittingReview ? 'Enviando...' : 'Enviar Resena'}
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
                            {reviewsLoading ? (
                                <p className="text-gray-600 text-sm text-center py-4">
                                    Cargando resenas...
                                </p>
                            ) : visibleReviews.map((review) => (
                                <div key={review.id} className="p-4 border border-gray-100 rounded-xl bg-white">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <span className="font-semibold text-gray-900">{review.user.name}</span>
                                            <div className="flex gap-0.5 mt-0.5">
                                                {Array.from({ length: 5 }, (_, i) => (
                                                    <span key={i} className={`text-sm ${i < review.rating ? 'text-yellow-400' : 'text-gray-200'}`}>*</span>
                                                ))}
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(review.createdAt).toLocaleDateString('es-DO')}
                                        </span>
                                    </div>
                                    {review.comment && <p className="text-sm text-gray-600">{review.comment}</p>}
                                </div>
                            ))}
                            {!reviewsLoading && visibleReviews.length === 0 && (
                                <p className="text-gray-600 text-sm text-center py-4">
                                    Aun no hay resenas. Se el primero en opinar!
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar - Contact */}
                <div className="space-y-6">
                    <div className="panel-premium p-6 lg:sticky lg:top-24 border-t-4 border-accent-600">
                        <h2 className="font-display font-semibold text-gray-900 mb-4">Contacto</h2>
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
                        <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                <span className="font-semibold text-gray-700">Indice de confianza</span>
                                <span className={`font-semibold ${
                                    trust.level === 'ALTA'
                                        ? 'text-green-700'
                                        : trust.level === 'MEDIA'
                                            ? 'text-amber-700'
                                            : 'text-red-700'
                                }`}>
                                    {trust.score}/100
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-white border border-primary-100 overflow-hidden">
                                <div
                                    className={`h-full ${
                                        trust.level === 'ALTA'
                                            ? 'bg-green-500'
                                            : trust.level === 'MEDIA'
                                                ? 'bg-amber-500'
                                                : 'bg-red-500'
                                    }`}
                                    style={{ width: `${trust.score}%` }}
                                />
                            </div>
                        </div>
                        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-700">Reputacion oficial</span>
                                {reputationLoading ? (
                                    <span className="text-[11px] text-slate-500">Cargando...</span>
                                ) : reputationProfile ? (
                                    <span className="text-[11px] rounded-full bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                                        Tier {tierLabel(reputationProfile.business.reputationTier)}
                                    </span>
                                ) : null}
                            </div>
                            {reputationProfile ? (
                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Score</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {reputationProfile.business.reputationScore.toFixed(1)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Rating</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {reputationProfile.metrics.averageRating > 0
                                                ? reputationProfile.metrics.averageRating.toFixed(1)
                                                : '0.0'}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Resenas</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {reputationProfile.metrics.reviewCount}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Reservas completadas</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {reputationProfile.metrics.bookings.completed}
                                        </p>
                                    </div>
                                    <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Volumen transaccional</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {formatCurrencyDop(reputationProfile.metrics.grossRevenue)}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">
                                    Perfil de reputacion aun no disponible para este negocio.
                                </p>
                            )}
                        </div>
                        <div className="space-y-3">
                            {business.phone && (
                                <a
                                    href={`tel:${business.phone}`}
                                    onClick={handlePhoneClick}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-primary-50/50 border border-primary-100 hover:bg-primary-100 transition-colors hover-lift group"
                                >
                                    <span className="text-lg">Tel</span>
                                    <div>
                                        <div className="text-xs text-gray-600">Telefono</div>
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
                                        : 'bg-green-50 hover:bg-green-100 border border-green-100'
                                        }`}
                                >
                                    <span className="text-lg">WA</span>
                                    <div>
                                        <div className="text-xs text-gray-600">WhatsApp</div>
                                        <div className="text-sm font-medium text-green-700">
                                            {contactVariant === 'emphasis' ? 'Chatea ahora' : business.whatsapp}
                                        </div>
                                    </div>
                                </a>
                            )}
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-50/40 border border-primary-100">
                                <span className="text-lg">Dir</span>
                                <div>
                                    <div className="text-xs text-gray-600">Direccion</div>
                                    <div className="text-sm text-gray-700">{business.address}</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-gray-100 pt-6">
                            {isAuthenticated && isCustomerRole && canBookThisBusiness && (
                                <div className="mb-6">
                                    <h3 className="font-display font-semibold text-gray-900 mb-3">
                                        Reservar ahora
                                    </h3>
                                    <form onSubmit={handleBookingSubmit} className="space-y-3">
                                        <input
                                            type="datetime-local"
                                            className="input-field text-sm"
                                            value={bookingForm.scheduledFor}
                                            onChange={(event) =>
                                                setBookingForm((previous) => ({
                                                    ...previous,
                                                    scheduledFor: event.target.value,
                                                }))
                                            }
                                        />
                                        <input
                                            type="number"
                                            min="1"
                                            className="input-field text-sm"
                                            placeholder="Cantidad de personas"
                                            value={bookingForm.partySize}
                                            onChange={(event) =>
                                                setBookingForm((previous) => ({
                                                    ...previous,
                                                    partySize: event.target.value,
                                                }))
                                            }
                                        />
                                        <textarea
                                            className="input-field text-sm"
                                            rows={2}
                                            placeholder="Notas de la reserva (opcional)"
                                            value={bookingForm.notes}
                                            onChange={(event) =>
                                                setBookingForm((previous) => ({
                                                    ...previous,
                                                    notes: event.target.value,
                                                }))
                                            }
                                        />
                                        <button
                                            type="submit"
                                            className="btn-primary text-sm w-full"
                                            disabled={submittingBooking}
                                        >
                                            {submittingBooking ? 'Enviando reserva...' : 'Enviar reserva'}
                                        </button>
                                    </form>

                                    {bookingErrorMessage && (
                                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {bookingErrorMessage}
                                        </div>
                                    )}

                                    {bookingSuccessMessage && (
                                        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                            {bookingSuccessMessage}
                                        </div>
                                    )}
                                </div>
                            )}
                            {isAuthenticated && isCustomerRole && !canBookThisBusiness && (
                                <div className="mb-6 rounded-xl border border-primary-100 bg-primary-50/60 p-4 text-sm text-slate-700">
                                    Este negocio no gestiona reservas en linea. Usa WhatsApp o mensaje directo para coordinar.
                                </div>
                            )}

                            <h3 className="font-display font-semibold text-gray-900 mb-3">
                                Mensaje directo
                            </h3>

                            {!isAuthenticated && (
                                <form onSubmit={handlePublicLeadSubmit} className="space-y-3">
                                    <input
                                        className="input-field text-sm"
                                        placeholder="Tu nombre"
                                        value={publicLeadForm.contactName}
                                        onChange={(event) =>
                                            setPublicLeadForm((previous) => ({
                                                ...previous,
                                                contactName: event.target.value,
                                            }))
                                        }
                                    />
                                    <input
                                        className="input-field text-sm"
                                        placeholder="Tu telefono"
                                        value={publicLeadForm.contactPhone}
                                        onChange={(event) =>
                                            setPublicLeadForm((previous) => ({
                                                ...previous,
                                                contactPhone: event.target.value,
                                            }))
                                        }
                                    />
                                    <input
                                        className="input-field text-sm"
                                        placeholder="Tu email (opcional)"
                                        value={publicLeadForm.contactEmail}
                                        onChange={(event) =>
                                            setPublicLeadForm((previous) => ({
                                                ...previous,
                                                contactEmail: event.target.value,
                                            }))
                                        }
                                    />
                                    <textarea
                                        className="input-field text-sm"
                                        rows={3}
                                        placeholder="Que necesitas?"
                                        value={publicLeadForm.message}
                                        onChange={(event) =>
                                            setPublicLeadForm((previous) => ({
                                                ...previous,
                                                message: event.target.value,
                                            }))
                                        }
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm w-full"
                                        disabled={submittingPublicLead}
                                    >
                                        {submittingPublicLead ? 'Enviando...' : 'Solicitar cotizacion sin cuenta'}
                                    </button>
                                    <p className="text-xs text-gray-500">
                                        Ya tienes cuenta? <Link to="/login" className="underline font-medium">Inicia sesion</Link>
                                    </p>
                                </form>
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
                                        className="btn-primary text-sm w-full sm:w-auto"
                                        disabled={sendingMessage}
                                    >
                                        {sendingMessage ? 'Enviando...' : 'Enviar mensaje'}
                                    </button>
                                </form>
                            )}

                            {publicLeadErrorMessage && (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {publicLeadErrorMessage}
                                </div>
                            )}

                            {publicLeadSuccessMessage && (
                                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                    {publicLeadSuccessMessage}
                                </div>
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

