import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { analyticsApi, bookingsApi, businessApi, checkinsApi, favoritesApi, messagingApi, promotionsApi, reputationApi, reviewApi, whatsappApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';
import { OptimizedImage } from '../components/OptimizedImage';
import { ActionBar, EmptyStateCard, InlineNotice, PublicPageShell, SkeletonLoader } from '../components/ui';
import { useNearViewport } from '../hooks/useNearViewport';
import { getOrAssignExperimentVariant } from '../lib/abTesting';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { trackGrowthEvent as trackGrowthSignal } from '../lib/growthTracking';
import { BUSINESS_DAY_OPTIONS, businessPriceRangeLabel } from '../lib/businessProfile';
import { formatPublicCategoryIcon, formatPublicCategoryPath } from '../lib/categoryLabel';
import { calculateBusinessTrustScore } from '../lib/trust';
import { applySeoMeta, removeJsonLd, upsertJsonLd } from '../seo/meta';
import { featureFlags } from '../config/features';
import { MobileContactBar } from './business-details/MobileContactBar';
import { SidebarPanel } from './business-details/SidebarPanel';
import {
    buildHeroGallery,
    businessSupportsBooking,
    findPreferredGalleryIndex,
    formatDaysAgo,
    getCurrentLocation,
    getDisplayInitial,
    renderStarsSafe,
} from './business-details/helpers';
import type {
    Business,
    CheckInStats,
    ContactPlacement,
    FavoriteList,
    NearbyBusiness,
    PublicPromotion,
    ReputationProfile,
    ReviewEntry,
} from './business-details/types';

const PromotionsSectionLazy = lazy(async () => {
    const module = await import('./business-details/PromotionsSection');
    return { default: module.PromotionsSection };
});

const NearbyBusinessesSectionLazy = lazy(async () => {
    const module = await import('./business-details/NearbyBusinessesSection');
    return { default: module.NearbyBusinessesSection };
});

const ReviewsSectionLazy = lazy(async () => {
    const module = await import('./business-details/ReviewsSection');
    return { default: module.ReviewsSection };
});

const CLAIM_STATUS_META = {
    CLAIMED: {
        label: 'Reclamado',
        heroClass: 'bg-primary-700 text-white',
        badgeClass: 'bg-primary-100 text-primary-700 border border-primary-200',
        cardClass: 'border-primary-200 bg-primary-50/60',
        eyebrowClass: 'text-primary-700',
        description: 'El negocio ya activo su ownership dentro de AquiTa.do y puede usar herramientas tenant.',
    },
    PENDING_CLAIM: {
        label: 'Reclamacion en revision',
        heroClass: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
        badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
        cardClass: 'border-amber-200 bg-amber-50',
        eyebrowClass: 'text-amber-700',
        description: 'Ya existe una solicitud de reclamacion. El equipo admin esta validando la evidencia.',
    },
    UNCLAIMED: {
        label: 'No reclamado',
        heroClass: 'bg-white/15 text-white ring-1 ring-white/20',
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
        cardClass: 'border-slate-200 bg-slate-50',
        eyebrowClass: 'text-slate-600',
        description: 'Esta ficha pertenece al catalogo publico. Las herramientas SaaS se habilitan cuando el dueno reclama el perfil.',
    },
    SUSPENDED: {
        label: 'Claim suspendido',
        heroClass: 'bg-red-100 text-red-900 ring-1 ring-red-200',
        badgeClass: 'bg-red-100 text-red-800 border border-red-200',
        cardClass: 'border-red-200 bg-red-50',
        eyebrowClass: 'text-red-700',
        description: 'El control operativo de esta ficha fue suspendido. El equipo admin debe revisar el caso antes de habilitar nuevos claims.',
    },
} as const;

const CLAIM_EVIDENCE_OPTIONS = [
    { value: 'PHONE', label: 'Telefono del negocio' },
    { value: 'EMAIL_DOMAIN', label: 'Dominio de email oficial' },
    { value: 'DOCUMENT', label: 'Documento o constancia' },
    { value: 'SOCIAL', label: 'Red social o web oficial' },
    { value: 'MANUAL', label: 'Nota explicativa manual' },
] as const;

function getClaimEvidencePlaceholder(
    evidenceType: typeof CLAIM_EVIDENCE_OPTIONS[number]['value'],
): string {
    if (evidenceType === 'PHONE') {
        return 'Ej. 8095550101';
    }
    if (evidenceType === 'EMAIL_DOMAIN') {
        return 'Ej. @negocio.com o hola@negocio.com';
    }
    if (evidenceType === 'SOCIAL') {
        return 'Ej. https://negocio.com o https://instagram.com/negocio';
    }
    if (evidenceType === 'DOCUMENT') {
        return 'Ej. RNC, licencia o nombre del archivo';
    }
    return 'Describe la evidencia que demuestra tu relacion con el negocio';
}

function DetailSectionFallback({ label }: { label: string }) {
    return (
        <div className="panel-premium p-6">
            <div className="h-4 w-28 rounded-full bg-slate-100 animate-pulse" />
            <div className="mt-3 h-7 w-52 rounded-full bg-slate-100 animate-pulse" />
            <div className="mt-5 space-y-3">
                <div className="h-20 rounded-[1.25rem] bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-[1.25rem] bg-slate-100 animate-pulse" />
            </div>
            <span className="sr-only">{label}</span>
        </div>
    );
}

function DeferredSectionPlaceholder({ label }: { label: string }) {
    return (
        <div className="panel-premium p-6">
            <div className="h-4 w-24 rounded-full bg-slate-100 animate-pulse" />
            <div className="mt-3 h-6 w-56 rounded-full bg-slate-100 animate-pulse" />
            <div className="mt-5 grid gap-3">
                <div className="h-20 rounded-[1.25rem] bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-[1.25rem] bg-slate-100 animate-pulse" />
            </div>
            <span className="sr-only">{label}</span>
        </div>
    );
}

export function BusinessDetails() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const { isAuthenticated, user } = useAuth();
    const isCustomerRole = user?.role === 'USER';
    const isBusinessOwnerRole = user?.role === 'BUSINESS_OWNER';
    const isAdminRole = user?.role === 'ADMIN';
    const hasOperatorRole = isBusinessOwnerRole || isAdminRole;
    const canUseCustomerContactFlows = !isAuthenticated || isCustomerRole;
    const showBookings = featureFlags.bookings;
    const showCheckins = featureFlags.checkins;
    const showMessaging = featureFlags.messaging;
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
    const [claimForm, setClaimForm] = useState<{
        evidenceType: typeof CLAIM_EVIDENCE_OPTIONS[number]['value'];
        evidenceValue: string;
        notes: string;
    }>({
        evidenceType: 'PHONE',
        evidenceValue: '',
        notes: '',
    });
    const [submittingBooking, setSubmittingBooking] = useState(false);
    const [submittingClaim, setSubmittingClaim] = useState(false);
    const [claimFormVisible, setClaimFormVisible] = useState(false);
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
    const [claimErrorMessage, setClaimErrorMessage] = useState('');
    const [claimSuccessMessage, setClaimSuccessMessage] = useState('');
    const [publicLeadErrorMessage, setPublicLeadErrorMessage] = useState('');
    const [publicLeadSuccessMessage, setPublicLeadSuccessMessage] = useState('');
    const [contactVariant, setContactVariant] = useState('control');
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [favoriteProcessing, setFavoriteProcessing] = useState(false);
    const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [newListName, setNewListName] = useState('');
    const [listProcessing, setListProcessing] = useState(false);
    const [favoriteInfoMessage, setFavoriteInfoMessage] = useState('');
    const [favoriteErrorMessage, setFavoriteErrorMessage] = useState('');
    const [shareFeedback, setShareFeedback] = useState('');
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
    const [promotionsSectionRef, promotionsSectionVisible] = useNearViewport<HTMLDivElement>('420px 0px', 0.01, business?.id);
    const [nearbySectionRef, nearbySectionVisible] = useNearViewport<HTMLDivElement>('420px 0px', 0.01, business?.id);
    const [reviewsSectionRef, reviewsSectionVisible] = useNearViewport<HTMLDivElement>('420px 0px', 0.01, business?.id);

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
            setActiveImage(findPreferredGalleryIndex(res.data?.images ?? []));
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
                const loadedLists = ((listsResponse.data?.data ?? []) as FavoriteList[]);

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
        if (!showCheckins || (isAuthenticated && !isCustomerRole)) {
            setCheckInStats(null);
            return;
        }

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
    }, [business?.id, isAuthenticated, isCustomerRole, showCheckins]);

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
            setPublicPromotions([]);
            setPromotionsLoading(false);
            return;
        }

        if (!promotionsSectionVisible) {
            setPublicPromotions([]);
            setPromotionsLoading(false);
            return;
        }

        let active = true;
        setPromotionsLoading(true);

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

        return () => {
            active = false;
        };
    }, [business?.id, promotionsSectionVisible]);

    useEffect(() => {
        if (!business?.id) {
            setNearbyBusinesses([]);
            setNearbyLoading(false);
            return;
        }

        if (
            !nearbySectionVisible
            || typeof business.latitude !== 'number'
            || typeof business.longitude !== 'number'
        ) {
            setNearbyBusinesses([]);
            setNearbyLoading(false);
            return;
        }

        let active = true;
        setNearbyLoading(true);

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

        return () => {
            active = false;
        };
    }, [business?.id, business?.latitude, business?.longitude, nearbySectionVisible]);

    useEffect(() => {
        if (!business?.id) {
            setReviews([]);
            setReviewsLoading(false);
            return;
        }

        if (!reviewsSectionVisible) {
            setReviews([]);
            setReviewsLoading(false);
            return;
        }

        let active = true;
        setReviewsLoading(true);

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

        return () => {
            active = false;
        };
    }, [business?.id, reviewsSectionVisible]);

    useEffect(() => {
        if (!shareFeedback) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setShareFeedback('');
        }, 2800);

        return () => window.clearTimeout(timeoutId);
    }, [shareFeedback]);

    const handleReviewSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthenticated || !isCustomerRole) {
            setReviewErrorMessage('Solo los usuarios clientes pueden dejar reseñas');
            return;
        }
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
        if (!isAuthenticated || !isCustomerRole) {
            setMessageErrorMessage('Solo usuarios clientes pueden enviar mensajes directos');
            return;
        }
        if (!isClaimedBusiness) {
            setMessageErrorMessage('La mensajeria se habilita cuando el dueno reclama este perfil');
            return;
        }
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
    const priceRangeLabel = businessPriceRangeLabel(business?.priceRange);
    const displayLocation = [
        business?.address,
        business?.sector?.name,
        business?.city?.name,
        business?.province?.name,
    ].filter(Boolean).join(' · ');
    const heroGallery = buildHeroGallery(business?.images ?? [], activeImage, 3);
    const featuredGalleryEntry = heroGallery.lead;
    const featuredImage = featuredGalleryEntry?.image ?? null;
    const desktopPreviewEntries = heroGallery.previews;
    const reviewStarsLabel = averageRatingNumber ? renderStarsSafe(averageRatingNumber) : null;
    const todayDayOfWeek = new Date().getDay();
    const hoursByDay = BUSINESS_DAY_OPTIONS.map((day) => ({
        ...day,
        schedule: business?.hours?.find((entry) => entry.dayOfWeek === day.dayOfWeek) ?? null,
    }));
    const profileCompleteness = Math.max(0, Math.min(100, business?.profileCompletenessScore ?? 0));
    const hasBusinessHours = Boolean(business?.hours && business.hours.length > 0);
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
    const claimStatus = business?.claimStatus ?? 'UNCLAIMED';
    const claimMeta = CLAIM_STATUS_META[claimStatus];
    const isClaimedBusiness = claimStatus === 'CLAIMED';
    const showClaimCallout = claimStatus !== 'CLAIMED';
    const canUseOperationalContactFlows = canUseCustomerContactFlows && isClaimedBusiness;
    const canBookThisBusiness = showBookings && isClaimedBusiness && businessSupportsBooking(business?.features);

    const trackContactGrowthEvent = (
        eventType: 'CONTACT_CLICK' | 'WHATSAPP_CLICK' | 'BOOKING_INTENT',
        metadata: Record<string, unknown>,
    ) => {
        if (!business?.id) {
            return;
        }

        void trackGrowthSignal({
            eventType,
            businessId: business.id,
            variantKey: contactExperimentVariant,
            metadata,
        });
    };

    const trackClaimCtaClick = useCallback((source: string) => {
        if (!business?.id) {
            return;
        }

        void trackGrowthSignal({
            eventType: 'CLAIM_CTA_CLICK',
            businessId: business.id,
            provinceId: business.province?.id,
            cityId: business.city?.id,
            metadata: {
                source,
                claimStatus,
                isAuthenticated,
            },
        });
    }, [business, claimStatus, isAuthenticated]);
    const claimFormHighlighted = (
        claimFormVisible
        || (
            searchParams.get('claim') === '1'
            && showClaimCallout
            && business?.isClaimable
            && claimStatus === 'UNCLAIMED'
        )
    );

    const handlePhoneClick = (placement: ContactPlacement = 'sidebar_card') => {
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
            placement,
        });
    };

    const handleShare = async (placement = 'hero_actions') => {
        if (!business) {
            return;
        }

        const shareUrl = typeof window !== 'undefined'
            ? window.location.href
            : `https://aquitado.vercel.app/businesses/${business.slug || business.id}`;

        try {
            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                await navigator.share({
                    title: business.name,
                    text: `Mira ${business.name} en AquiTa.do`,
                    url: shareUrl,
                });
                void trackGrowthSignal({
                    eventType: 'SHARE_CLICK',
                    businessId: business.id,
                    metadata: {
                        source: 'business-details',
                        placement,
                        method: 'native-share',
                    },
                });
                setShareFeedback('Enlace compartido');
                return;
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
        }

        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                void trackGrowthSignal({
                    eventType: 'SHARE_CLICK',
                    businessId: business.id,
                    metadata: {
                        source: 'business-details',
                        placement,
                        method: 'clipboard',
                    },
                });
                setShareFeedback('Enlace copiado');
                return;
            }
        } catch {
            // Fallback handled below.
        }

        setShareFeedback('No se pudo compartir desde este navegador');
    };

    const openWhatsApp = async (placement: ContactPlacement = 'sidebar_primary') => {
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
            placement,
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
                placement,
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

        if (!isClaimedBusiness) {
            setPublicLeadErrorMessage('Este perfil aun no activo sus canales tenant dentro de AquiTa.do');
            return;
        }

        if (!publicLeadForm.contactName.trim() || !publicLeadForm.contactPhone.trim() || !publicLeadForm.message.trim()) {
            setPublicLeadErrorMessage('Nombre, teléfono y mensaje son obligatorios');
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
            setPublicLeadSuccessMessage('Solicitud enviada. Te contactarán pronto.');
            void trackGrowthSignal({
                eventType: 'CONTACT_CLICK',
                businessId: business.id,
                metadata: {
                    source: 'public-lead-form',
                    placement: 'public_lead_form',
                },
            });
        } catch (error) {
            setPublicLeadErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la solicitud'));
        } finally {
            setSubmittingPublicLead(false);
        }
    };

    const handleWhatsAppClick = (
        event: React.MouseEvent<HTMLAnchorElement>,
        placement: ContactPlacement = 'sidebar_card',
    ) => {
        event.preventDefault();
        void openWhatsApp(placement);
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
        if (!showBookings) {
            return;
        }

        if (!business?.id) {
            return;
        }

        if (!isClaimedBusiness) {
            setBookingErrorMessage('Las reservas se habilitan cuando el dueno reclama este perfil');
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

    const handleClaimSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!business?.id) {
            return;
        }

        if (!isAuthenticated) {
            setClaimErrorMessage('Inicia sesion para solicitar la reclamacion del negocio');
            return;
        }

        if (!business.isClaimable || claimStatus === 'CLAIMED') {
            setClaimErrorMessage('Este negocio ya no esta disponible para reclamacion');
            return;
        }

        if (claimStatus === 'PENDING_CLAIM') {
            setClaimErrorMessage('Ya existe una solicitud pendiente para este negocio');
            return;
        }

        const trimmedEvidenceValue = claimForm.evidenceValue.trim();
        const trimmedNotes = claimForm.notes.trim();
        if (!trimmedEvidenceValue && !trimmedNotes) {
            setClaimErrorMessage('Comparte al menos una evidencia o una nota para revisar tu solicitud');
            return;
        }

        setSubmittingClaim(true);
        setClaimErrorMessage('');
        setClaimSuccessMessage('');

        try {
            await businessApi.createClaimRequest(business.id, {
                evidenceType: claimForm.evidenceType,
                evidenceValue: trimmedEvidenceValue || undefined,
                notes: trimmedNotes || undefined,
            });
            setClaimForm({
                evidenceType: 'PHONE',
                evidenceValue: '',
                notes: '',
            });
            await loadBusiness();
            setClaimSuccessMessage('Solicitud enviada. El equipo admin la revisara antes de activar el perfil.');
        } catch (error) {
            setClaimErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la solicitud de reclamacion'));
        } finally {
            setSubmittingClaim(false);
        }
    };

    const handleCreateCheckIn = async () => {
        if (!showCheckins || !business?.id || !isAuthenticated || !isCustomerRole) {
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
            <PublicPageShell width="wide" className="py-8 pb-28 lg:pb-8">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3" aria-busy="true">
                    <div className="space-y-6 lg:col-span-2" aria-hidden="true">
                        <div className="panel-premium overflow-hidden">
                            <div className="h-[320px] animate-pulse bg-slate-100 md:h-[380px]"></div>
                            <div className="space-y-4 px-6 py-5">
                                <div className="flex flex-wrap gap-2">
                                    <div className="h-7 w-24 rounded-full bg-slate-100"></div>
                                    <div className="h-7 w-28 rounded-full bg-slate-100"></div>
                                </div>
                                <div className="h-8 w-3/4 rounded-full bg-slate-100"></div>
                                <div className="h-4 w-5/6 rounded-full bg-slate-100"></div>
                                <div className="h-4 w-2/3 rounded-full bg-slate-100"></div>
                            </div>
                        </div>

                        <div className="panel-premium space-y-4 px-6 py-5">
                            <div className="h-5 w-36 rounded-full bg-slate-100"></div>
                            <div className="h-4 w-full rounded-full bg-slate-100"></div>
                            <div className="h-4 w-full rounded-full bg-slate-100"></div>
                            <div className="h-4 w-4/5 rounded-full bg-slate-100"></div>
                        </div>

                        <div className="panel-premium px-6 py-5">
                            <div className="h-5 w-44 rounded-full bg-slate-100"></div>
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <SkeletonLoader variant="details-item" count={4} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6" aria-hidden="true">
                        <div className="panel-premium px-5 py-6">
                            <div className="h-5 w-32 rounded-full bg-slate-100"></div>
                            <div className="mt-5 h-11 w-full rounded-2xl bg-slate-100"></div>
                            <div className="mt-3 h-11 w-full rounded-2xl bg-slate-100"></div>
                            <div className="mt-5 h-24 w-full rounded-[1.5rem] bg-slate-100"></div>
                        </div>

                        <div className="panel-premium px-5 py-6">
                            <div className="h-5 w-40 rounded-full bg-slate-100"></div>
                            <div className="mt-4 space-y-3">
                                <SkeletonLoader variant="text-line" count={5} />
                            </div>
                        </div>
                    </div>
                </div>
            </PublicPageShell>
        );
    }

    if (!business) {
        return (
            <PublicPageShell width="wide" className="py-16 pb-28 lg:pb-8">
                <EmptyStateCard
                    title="Negocio no encontrado"
                    body={errorMessage || 'No pudimos encontrar esta ficha. Puede haber cambiado de ruta o ya no estar disponible.'}
                    action={(
                        <ActionBar className="justify-center">
                            <Link to="/businesses" className="btn-primary text-sm">
                                Volver al directorio
                            </Link>
                            <Link to="/" className="btn-secondary text-sm">
                                Ir al inicio
                            </Link>
                        </ActionBar>
                    )}
                />
            </PublicPageShell>
        );
    }

    return (
        <PublicPageShell width="wide" className="py-8 pb-28 lg:pb-8 animate-fade-in">
            {errorMessage && (
                <InlineNotice
                    className="mb-4"
                    tone="danger"
                    title="No pudimos actualizar todo el perfil"
                    body={errorMessage}
                />
            )}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Image Gallery */}
                    <div className="panel-premium overflow-hidden">
                        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.7fr)_15rem]">
                        <div className="relative min-h-[340px] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary-900 via-primary-700 to-accent-700 md:min-h-[420px] lg:min-h-[460px]">
                            {featuredImage ? (
                                <OptimizedImage
                                    src={featuredImage.url}
                                    alt={featuredImage.caption || business.name}
                                    className="h-full w-full object-cover"
                                    priority
                                    sizes="(min-width: 1280px) 44vw, (min-width: 1024px) 56vw, 100vw"
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-8xl font-display font-bold text-white/20">
                                    {getDisplayInitial(business.name)}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/10"></div>
                            {business.images.length > 1 ? (
                                <div className="absolute right-4 top-4 rounded-full border border-white/20 bg-slate-950/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                                    Galeria {business.images.length} fotos
                                </div>
                            ) : null}
                            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                                    <div className="max-w-3xl">
                                        <div className="mb-3 flex flex-wrap gap-2">
                                            {business.verified && (
                                                <span className="rounded-full bg-primary-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                                                    Verificado
                                                </span>
                                            )}
                                            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${claimMeta.heroClass}`}>
                                                {claimMeta.label}
                                            </span>
                                            {business.openNow !== null && business.openNow !== undefined && (
                                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                                    business.openNow
                                                        ? 'bg-white text-primary-700'
                                                        : 'bg-white/15 text-white ring-1 ring-white/20'
                                                }`}>
                                                    {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                                </span>
                                            )}
                                            {business.categories?.slice(0, 2).map((entry) => (
                                                <span
                                                    key={entry.category.name}
                                                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm"
                                                >
                                                    {formatPublicCategoryIcon(entry.category.icon) ? `${formatPublicCategoryIcon(entry.category.icon)} ` : ''}
                                                    {formatPublicCategoryPath(entry.category.parent?.name, entry.category.name)}
                                                </span>
                                            ))}
                                            {priceRangeLabel && (
                                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                                                    {priceRangeLabel}
                                                </span>
                                            )}
                                        </div>
                                        <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
                                            {business.name}
                                        </h1>
                                        <p className="mt-3 text-sm text-white/80">{displayLocation}</p>
                                        {business.todayHoursLabel && (
                                            <p className="mt-1 text-sm text-white/75">Hoy: {business.todayHoursLabel}</p>
                                        )}
                                    </div>
                                    {averageRating && (
                                        <div className="w-fit rounded-[1.5rem] border border-white/12 bg-amber-500/95 px-5 py-4 text-center text-white shadow-lg shadow-amber-900/30 backdrop-blur-sm">
                                            <div className="font-display text-4xl font-bold leading-none">{averageRating}</div>
                                            {reviewStarsLabel && (
                                                <div className="mt-1 text-xs tracking-[0.22em] text-white/90">{reviewStarsLabel}</div>
                                            )}
                                            <div className="mt-1 text-[11px] font-medium text-white/80">
                                                {reviewCount} reseña{reviewCount === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                            {desktopPreviewEntries.length > 0 ? (
                                <div className="hidden gap-3 lg:grid lg:grid-rows-3">
                                    {desktopPreviewEntries.map((entry, previewIndex) => (
                                        <button
                                            key={entry.image.id}
                                            type="button"
                                            onClick={() => setActiveImage(entry.index)}
                                            className="group relative overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-slate-100 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg"
                                            aria-label={`Mostrar foto ${entry.index + 1} de ${business.images.length}`}
                                        >
                                            <OptimizedImage
                                                src={entry.image.url}
                                                alt={entry.image.caption || `${business.name} foto ${entry.index + 1}`}
                                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                                sizes="15rem"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent"></div>
                                            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                                                <div>
                                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                                                        Vista {entry.index + 1}
                                                    </p>
                                                    <p className="mt-1 text-sm font-semibold text-white">Cambiar foto</p>
                                                </div>
                                                {previewIndex === desktopPreviewEntries.length - 1 && heroGallery.remainingCount > 0 ? (
                                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                                                        +{heroGallery.remainingCount}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        {business.images.length > 1 && (
                            <div className="border-t border-slate-100 bg-slate-50/70 p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        Recorrido visual
                                    </p>
                                    <span className="text-xs font-medium text-slate-500">
                                        {activeImage + 1} de {business.images.length}
                                    </span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                {business.images.map((img, i) => (
                                    <button
                                        key={img.id}
                                        type="button"
                                        onClick={() => setActiveImage(i)}
                                        className={`h-[4.5rem] w-[4.5rem] flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                                            i === activeImage
                                                ? 'border-primary-500 shadow-md shadow-primary-200/70'
                                                : 'border-transparent opacity-80 hover:opacity-100'
                                        }`}
                                        aria-label={`Seleccionar foto ${i + 1}`}
                                    >
                                        <OptimizedImage
                                            src={img.url}
                                            alt={img.caption || `${business.name} foto ${i + 1}`}
                                            className="h-full w-full object-cover"
                                            sizes="72px"
                                        />
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="panel-premium p-6 md:p-7">
                        <div className="mb-6 flex flex-wrap gap-3">
                            {isAuthenticated && isCustomerRole ? (
                                <button
                                    type="button"
                                    onClick={() => void handleToggleFavorite()}
                                    disabled={favoriteProcessing || favoriteLoading}
                                    className={`btn-primary text-sm ${isFavorite ? '!bg-primary-700' : ''}`}
                                >
                                    {favoriteProcessing
                                        ? 'Guardando...'
                                        : isFavorite
                                            ? 'Guardado en favoritos'
                                            : 'Guardar en favoritos'}
                                </button>
                            ) : (
                                <Link to={isAuthenticated ? '/profile' : '/login'} className="btn-primary text-sm">
                                    Guardar en favoritos
                                </Link>
                            )}
                            {googleMapsDirectionsUrl && (
                                <a
                                    href={googleMapsDirectionsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary text-sm"
                                >
                                    Como llegar
                                </a>
                            )}
                            <button type="button" className="btn-secondary text-sm" onClick={() => void handleShare('hero_actions')}>
                                Compartir
                            </button>
                        </div>

                        {(favoriteInfoMessage || favoriteErrorMessage || shareFeedback) && (
                            <div className="mb-4 flex flex-wrap gap-2 text-xs">
                                {favoriteInfoMessage ? (
                                    <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 font-medium text-primary-700">
                                        {favoriteInfoMessage}
                                    </span>
                                ) : null}
                                {favoriteErrorMessage ? (
                                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-medium text-red-700">
                                        {favoriteErrorMessage}
                                    </span>
                                ) : null}
                                {shareFeedback ? (
                                    <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 font-medium text-primary-700">
                                        {shareFeedback}
                                    </span>
                                ) : null}
                            </div>
                        )}

                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    {business.verified && (
                                        <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium border border-primary-200">
                                            OK Verificado
                                        </span>
                                    )}
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${claimMeta.badgeClass}`}>
                                        {claimMeta.label}
                                    </span>
                                    {business.openNow !== null && business.openNow !== undefined && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                            business.openNow
                                                ? 'bg-primary-100 text-primary-700 border-primary-200'
                                                : 'bg-gray-100 text-gray-600 border-gray-200'
                                        }`}>
                                            {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                        </span>
                                    )}
                                    {priceRangeLabel && (
                                        <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium border border-gray-200">
                                            {priceRangeLabel}
                                        </span>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                        {business.categories?.map((bc, i) => (
                                            <span key={i} className="bg-primary-50 text-primary-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {formatPublicCategoryIcon(bc.category.icon) ? `${formatPublicCategoryIcon(bc.category.icon)} ` : ''}
                                                {formatPublicCategoryPath(bc.category.parent?.name, bc.category.name)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resumen del negocio</p>
                                <h2 className="mt-2 font-display text-2xl font-bold text-gray-900 leading-tight md:text-3xl">{business.name}</h2>
                                <p className="text-gray-500 mt-2 flex items-center gap-1">
                                    Dirección: {business.address}
                                    {business.province && ` - ${business.province.name}`}
                                    {business.city && `, ${business.city.name}`}
                                    {business.sector && `, ${business.sector.name}`}
                                </p>
                                {business.todayHoursLabel && (
                                    <p className="text-sm text-gray-500 mt-1">Hoy: {business.todayHoursLabel}</p>
                                )}
                            </div>
                            {averageRating && (
                                <div className="text-center bg-accent-50 border border-accent-100 px-4 py-2 rounded-xl md:min-w-[110px]">
                                    <div className="text-2xl font-bold text-accent-600">* {averageRating}</div>
                                    <div className="text-xs text-gray-500">{business._count?.reviews} reseñas</div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-4">
                            <p className="text-sm leading-7 text-slate-800 whitespace-pre-line">{business.description}</p>
                            {memberSinceYear && Number.isFinite(memberSinceYear) && (
                                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">
                                    En AquiTa.do desde {memberSinceYear}
                                </p>
                            )}
                        </div>

                        {showClaimCallout ? (
                            <div className={`mt-5 rounded-2xl border px-5 py-5 ${claimMeta.cardClass}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="max-w-2xl">
                                        <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${claimMeta.eyebrowClass}`}>
                                            Claim / ownership
                                        </p>
                                        <h3 className="mt-2 font-display text-2xl font-semibold text-slate-900">
                                            Eres el dueno? Reclama este perfil
                                        </h3>
                                        <p className="mt-2 text-sm leading-7 text-slate-700">
                                            {claimMeta.description}
                                        </p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${claimMeta.badgeClass}`}>
                                        {claimMeta.label}
                                    </span>
                                </div>

                                {claimStatus === 'PENDING_CLAIM' ? (
                                    <div className="mt-4 rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
                                        Ya existe una solicitud pendiente. Cuando el equipo admin termine la revision, el perfil podra activar su organizacion tenant y sus herramientas operativas.
                                    </div>
                                ) : claimStatus === 'SUSPENDED' ? (
                                    <div className="mt-4 rounded-xl border border-red-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
                                        El claim de esta ficha esta suspendido temporalmente. Si necesitas recuperar el control, contacta al equipo admin con evidencia oficial.
                                    </div>
                                ) : null}

                                {claimSuccessMessage ? (
                                    <div className="mt-4 rounded-xl border border-primary-200 bg-white/80 px-4 py-3 text-sm text-primary-700">
                                        {claimSuccessMessage}
                                    </div>
                                ) : null}
                                {claimErrorMessage ? (
                                    <div className="mt-4 rounded-xl border border-red-200 bg-white/80 px-4 py-3 text-sm text-red-700">
                                        {claimErrorMessage}
                                    </div>
                                ) : null}

                                {!isAuthenticated ? (
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <Link
                                            to="/login"
                                            className="btn-primary text-sm"
                                            onClick={() => trackClaimCtaClick('business-details-login-link')}
                                        >
                                            Inicia sesion para reclamar
                                        </Link>
                                        <p className="text-sm text-slate-600">
                                            Si ya tienes cuenta, comparte una evidencia y enviaremos la solicitud a revision.
                                        </p>
                                    </div>
                                ) : business.isClaimable && claimStatus === 'UNCLAIMED' ? (
                                    <form onSubmit={handleClaimSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
                                        <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-primary-100 bg-white/80 px-4 py-3">
                                            <button
                                                type="button"
                                                className="btn-primary text-sm"
                                                onClick={() => {
                                                    trackClaimCtaClick('business-details-claim-panel');
                                                    setClaimFormVisible(true);
                                                }}
                                            >
                                                Quiero reclamar este perfil
                                            </button>
                                            <p className="text-sm text-slate-600">
                                                {claimFormHighlighted
                                                    ? 'Perfecto. Completa la evidencia aqui abajo y enviaremos la solicitud a revision.'
                                                    : 'Usa este CTA para iniciar el claim y luego completa la evidencia en el formulario.'}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Tipo de evidencia
                                            </label>
                                            <select
                                                className="input-field text-sm"
                                                value={claimForm.evidenceType}
                                                onChange={(event) => setClaimForm((previous) => ({
                                                    ...previous,
                                                    evidenceType: event.target.value as typeof CLAIM_EVIDENCE_OPTIONS[number]['value'],
                                                }))}
                                            >
                                                {CLAIM_EVIDENCE_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Dato de verificacion
                                            </label>
                                            <input
                                                className="input-field text-sm"
                                                value={claimForm.evidenceValue}
                                                onChange={(event) => setClaimForm((previous) => ({
                                                    ...previous,
                                                    evidenceValue: event.target.value,
                                                }))}
                                                placeholder={getClaimEvidencePlaceholder(claimForm.evidenceType)}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Contexto adicional
                                            </label>
                                            <textarea
                                                className="input-field min-h-[110px] text-sm"
                                                value={claimForm.notes}
                                                onChange={(event) => setClaimForm((previous) => ({
                                                    ...previous,
                                                    notes: event.target.value,
                                                }))}
                                                placeholder="Cuéntanos por que puedes administrar este negocio, que organizacion usarias o como comprobarlo."
                                            />
                                        </div>
                                        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                                            <button
                                                type="submit"
                                                className="btn-primary text-sm"
                                                disabled={submittingClaim}
                                            >
                                                {submittingClaim ? 'Enviando solicitud...' : 'Solicitar reclamacion'}
                                            </button>
                                            <p className="text-sm text-slate-600">
                                                La solicitud queda auditada y solo un admin puede aprobarla o rechazarla.
                                            </p>
                                        </div>
                                    </form>
                                ) : null}
                            </div>
                        ) : null}

                        {isAuthenticated && isCustomerRole && (
                            <div className="mt-5 rounded-xl border border-primary-100 p-4 bg-primary-50/30 space-y-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Organiza este negocio en tus listas
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

                        {showCheckins && (!isAuthenticated || isCustomerRole) && (
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
                                        <p className="text-xs text-primary-700">{checkInInfoMessage}</p>
                                    ) : null}
                                    {checkInErrorMessage ? (
                                        <p className="text-xs text-red-700">{checkInErrorMessage}</p>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="mt-3 text-xs text-gray-600">
                                    Inicia sesión como usuario para registrar check-ins y ganar puntos.
                                </p>
                            )}
                            </div>
                        )}

                        {/* Features */}
                        {business.features && business.features.length > 0 && (
                            <div className="mt-6">
                                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Caracteristicas</h2>
                                <div className="flex flex-wrap gap-2">
                                    {business.features.map((bf, i) => (
                                        <span
                                            key={i}
                                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                                        >
                                            {bf.feature.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Map */}
                    {openStreetMapEmbedUrl && (
                        <div className="panel-premium defer-render-section overflow-hidden">
                            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ubicacion</p>
                                    <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">Ubicacion del negocio</h2>
                                    <p className="mt-1 text-sm text-slate-600">{displayLocation || business.address}</p>
                                </div>
                                {googleMapsDirectionsUrl && (
                                    <a
                                        href={googleMapsDirectionsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                                    >
                                        Ver en Google Maps
                                    </a>
                                )}
                            </div>
                            <div className="px-6 pb-6 pt-5">
                                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50">
                                    <div className="h-72 bg-gray-100">
                                        <iframe
                                            width="100%"
                                            height="100%"
                                            style={{ border: 0 }}
                                            loading="lazy"
                                            src={openStreetMapEmbedUrl}
                                            title={`Mapa de ubicacion de ${business.name}`}
                                            allowFullScreen
                                        ></iframe>
                                    </div>
                                    <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="min-w-0 truncate">{displayLocation || business.address}</span>
                                        {googleMapsDirectionsUrl && (
                                            <a
                                                href={googleMapsDirectionsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-medium text-primary-700 transition-colors hover:text-primary-800"
                                            >
                                                Abrir ruta
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={promotionsSectionRef} className="defer-render-section">
                        {promotionsSectionVisible ? (
                            <Suspense fallback={<DetailSectionFallback label="Cargando promociones" />}>
                                <PromotionsSectionLazy loading={promotionsLoading} promotions={publicPromotions} />
                            </Suspense>
                        ) : (
                            <DeferredSectionPlaceholder label="Promociones disponibles" />
                        )}
                    </div>

                    <div ref={nearbySectionRef} className="defer-render-section">
                        {nearbySectionVisible ? (
                            <Suspense fallback={<DetailSectionFallback label="Cargando negocios cercanos" />}>
                                <NearbyBusinessesSectionLazy businesses={nearbyBusinesses} loading={nearbyLoading} />
                            </Suspense>
                        ) : (
                            <DeferredSectionPlaceholder label="Negocios cercanos" />
                        )}
                    </div>

                    <div ref={reviewsSectionRef} className="defer-render-section">
                        {reviewsSectionVisible ? (
                            <Suspense fallback={<DetailSectionFallback label="Cargando resenas" />}>
                                <ReviewsSectionLazy
                                    averageRating={averageRating}
                                    averageRatingNumber={averageRatingNumber}
                                    isAuthenticated={isAuthenticated}
                                    isCustomerRole={isCustomerRole}
                                    onReviewFormChange={setReviewForm}
                                    onSubmit={handleReviewSubmit}
                                    reviewCount={reviewCount}
                                    reviewErrorMessage={reviewErrorMessage}
                                    reviewForm={reviewForm}
                                    reviews={visibleReviews}
                                    reviewsLoading={reviewsLoading}
                                    reviewStarsLabel={reviewStarsLabel}
                                    reviewSuccessMessage={reviewSuccessMessage}
                                    submittingReview={submittingReview}
                                />
                            </Suspense>
                        ) : (
                            <DeferredSectionPlaceholder label="Resenas del negocio" />
                        )}
                    </div>

                </div>

                {/* Sidebar - Contact */}
                <SidebarPanel
                    bookingErrorMessage={bookingErrorMessage}
                    bookingForm={bookingForm}
                    bookingSuccessMessage={bookingSuccessMessage}
                    business={business}
                    canBookThisBusiness={canBookThisBusiness}
                    canUseCustomerContactFlows={canUseOperationalContactFlows}
                    contactVariant={contactVariant}
                    hasBusinessHours={hasBusinessHours}
                    hasOperatorRole={hasOperatorRole}
                    hoursByDay={hoursByDay}
                    isClaimedBusiness={isClaimedBusiness}
                    isAdminRole={isAdminRole}
                    isAuthenticated={isAuthenticated}
                    isCustomerRole={isCustomerRole}
                    memberSinceYear={memberSinceYear}
                    messageErrorMessage={messageErrorMessage}
                    messageForm={messageForm}
                    messageSuccessMessage={messageSuccessMessage}
                    onBookingFormChange={setBookingForm}
                    onBookingSubmit={handleBookingSubmit}
                    onMessageFormChange={setMessageForm}
                    onMessageSubmit={handleMessageSubmit}
                    onOpenWhatsApp={openWhatsApp}
                    onPhoneClick={handlePhoneClick}
                    onPublicLeadFormChange={setPublicLeadForm}
                    onPublicLeadSubmit={handlePublicLeadSubmit}
                    onWhatsAppClick={handleWhatsAppClick}
                    priceRangeLabel={priceRangeLabel}
                    profileCompleteness={profileCompleteness}
                    publicLeadErrorMessage={publicLeadErrorMessage}
                    publicLeadForm={publicLeadForm}
                    publicLeadSuccessMessage={publicLeadSuccessMessage}
                    reputationLoading={reputationLoading}
                    reputationProfile={reputationProfile}
                    showBookings={showBookings}
                    showMessaging={showMessaging}
                    submittingBooking={submittingBooking}
                    submittingPublicLead={submittingPublicLead}
                    sendingMessage={sendingMessage}
                    todayDayOfWeek={todayDayOfWeek}
                    trust={trust}
                    updatedLabel={updatedLabel}
                    whatsappDirectUrl={whatsappDirectUrl}
                />
            </div>

            <MobileContactBar
                phone={business.phone}
                show={canUseOperationalContactFlows}
                whatsapp={business.whatsapp}
                onOpenWhatsApp={openWhatsApp}
                onPhoneClick={handlePhoneClick}
            />
        </PublicPageShell>
    );
}
