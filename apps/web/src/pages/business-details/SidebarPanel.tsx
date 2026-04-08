import type React from 'react';
import { Link } from 'react-router-dom';
import { formatHoursRange } from '../../lib/businessProfile';
import { tierLabel } from './helpers';
import type {
    BookingFormState,
    Business,
    ContactPlacement,
    MessageFormState,
    PublicLeadFormState,
    ReputationProfile,
} from './types';

interface HoursByDayEntry {
    dayOfWeek: number;
    label: string;
    schedule: {
        dayOfWeek: number;
        opensAt?: string | null;
        closesAt?: string | null;
        closed?: boolean | null;
    } | null;
}

interface SidebarPanelProps {
    bookingErrorMessage: string;
    bookingForm: BookingFormState;
    bookingSuccessMessage: string;
    business: Business;
    canBookThisBusiness: boolean;
    canUseCustomerContactFlows: boolean;
    contactVariant: string;
    hasBusinessHours: boolean;
    hasOperatorRole: boolean;
    hoursByDay: HoursByDayEntry[];
    isAdminRole: boolean;
    isAuthenticated: boolean;
    isCustomerRole: boolean;
    memberSinceYear: number | null;
    messageErrorMessage: string;
    messageForm: MessageFormState;
    messageSuccessMessage: string;
    onBookingFormChange: React.Dispatch<React.SetStateAction<BookingFormState>>;
    onBookingSubmit: (event: React.FormEvent) => void;
    onMessageFormChange: React.Dispatch<React.SetStateAction<MessageFormState>>;
    onMessageSubmit: (event: React.FormEvent) => void;
    onOpenWhatsApp: (placement?: ContactPlacement) => Promise<void>;
    onPhoneClick: (placement?: ContactPlacement) => void;
    onPublicLeadFormChange: React.Dispatch<React.SetStateAction<PublicLeadFormState>>;
    onPublicLeadSubmit: (event: React.FormEvent) => void;
    onWhatsAppClick: (event: React.MouseEvent<HTMLAnchorElement>, placement?: ContactPlacement) => void;
    priceRangeLabel: string | null;
    profileCompleteness: number;
    publicLeadErrorMessage: string;
    publicLeadForm: PublicLeadFormState;
    publicLeadSuccessMessage: string;
    reputationLoading: boolean;
    reputationProfile: ReputationProfile | null;
    showBookings: boolean;
    showMessaging: boolean;
    submittingBooking: boolean;
    submittingPublicLead: boolean;
    sendingMessage: boolean;
    todayDayOfWeek: number;
    trust: {
        score: number;
        level: 'ALTA' | 'MEDIA' | 'BAJA';
    };
    updatedLabel: string | null;
    whatsappDirectUrl: string | null;
}

export function SidebarPanel({
    bookingErrorMessage,
    bookingForm,
    bookingSuccessMessage,
    business,
    canBookThisBusiness,
    canUseCustomerContactFlows,
    contactVariant,
    hasBusinessHours,
    hasOperatorRole,
    hoursByDay,
    isAdminRole,
    isAuthenticated,
    isCustomerRole,
    memberSinceYear,
    messageErrorMessage,
    messageForm,
    messageSuccessMessage,
    onBookingFormChange,
    onBookingSubmit,
    onMessageFormChange,
    onMessageSubmit,
    onOpenWhatsApp,
    onPhoneClick,
    onPublicLeadFormChange,
    onPublicLeadSubmit,
    onWhatsAppClick,
    priceRangeLabel,
    profileCompleteness,
    publicLeadErrorMessage,
    publicLeadForm,
    publicLeadSuccessMessage,
    reputationLoading,
    reputationProfile,
    showBookings,
    showMessaging,
    submittingBooking,
    submittingPublicLead,
    sendingMessage,
    todayDayOfWeek,
    trust,
    updatedLabel,
    whatsappDirectUrl,
}: SidebarPanelProps) {
    const socialLinks = [
        { href: business.instagramUrl, label: 'Instagram' },
        { href: business.facebookUrl, label: 'Facebook' },
        { href: business.tiktokUrl, label: 'TikTok' },
    ].filter((entry): entry is { href: string; label: string } => Boolean(entry.href));
    const recommendedContactHint = business.whatsapp
        ? {
            title: 'Canal recomendado',
            description: canUseCustomerContactFlows
                ? 'WhatsApp suele ser la via mas rapida para confirmar disponibilidad, horarios o precios el mismo dia.'
                : 'Si este negocio responde por WhatsApp, suele ser el canal mas rapido para una consulta corta.',
        }
        : business.phone
            ? {
                title: 'Mejor siguiente paso',
                description: 'Llama si necesitas resolver disponibilidad inmediata, ubicacion o una coordinacion rapida.',
            }
            : business.email
                ? {
                    title: 'Mejor siguiente paso',
                    description: 'Usa email si necesitas compartir mas contexto, documentos o una solicitud detallada.',
                }
                : null;

    return (
        <div className="space-y-6">
            <div className="panel-premium overflow-hidden lg:sticky lg:top-24">
                <div className="bg-gradient-to-br from-primary-900 via-primary-800 to-accent-700 px-6 py-6 text-white">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Contacto</p>
                                <h2 className="mt-2 font-display text-3xl font-semibold text-white">Confianza y contacto</h2>
                            </div>
                            {priceRangeLabel ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                                    {priceRangeLabel}
                                </span>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {business.verified ? <PillLabel>Verificado</PillLabel> : null}
                            {updatedLabel ? <PillLabel subtle>{updatedLabel}</PillLabel> : null}
                            {memberSinceYear && Number.isFinite(memberSinceYear) ? <PillLabel subtle>En AquiTa.do desde {memberSinceYear}</PillLabel> : null}
                        </div>
                        <div className="rounded-[1.25rem] border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
                            <div className="mb-2 flex items-center justify-between text-xs text-white/75">
                                <span className="font-semibold text-white/85">Indice de confianza</span>
                                <span className={`font-semibold ${trust.level === 'ALTA' ? 'text-blue-100' : trust.level === 'MEDIA' ? 'text-amber-200' : 'text-rose-200'}`}>
                                    {trust.score}/100
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white/15">
                                <div
                                    className={`h-full ${trust.level === 'ALTA' ? 'bg-primary-200' : trust.level === 'MEDIA' ? 'bg-amber-300' : 'bg-rose-300'}`}
                                    style={{ width: `${trust.score}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 pb-6 pt-5">
                    <div className="mb-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Reputacion oficial</span>
                            {reputationLoading ? (
                                <span className="text-[11px] text-slate-500">Cargando...</span>
                            ) : reputationProfile ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    Tier {tierLabel(reputationProfile.business.reputationTier)}
                                </span>
                            ) : null}
                        </div>
                        {reputationProfile ? (
                            <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                                <MetricCard label="Score" value={reputationProfile.business.reputationScore.toFixed(1)} />
                                <MetricCard label="Rating" value={reputationProfile.metrics.averageRating > 0 ? reputationProfile.metrics.averageRating.toFixed(1) : '0.0'} />
                                <MetricCard label="Resenas" value={String(reputationProfile.metrics.reviewCount)} />
                                {showBookings ? <MetricCard label="Reservas completadas" value={String(reputationProfile.metrics.bookings.completed)} /> : null}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Perfil de reputacion todavia no disponible para este negocio.</p>
                        )}
                    </div>

                    <div className="space-y-3">
                        {business.phone ? (
                            <ContactRow
                                action={canUseCustomerContactFlows ? { href: `tel:${business.phone}`, onClick: () => onPhoneClick('sidebar_card') } : null}
                                icon="Tel"
                                label="Telefono"
                                tone="primary"
                                value={business.phone}
                            />
                        ) : null}
                        {business.whatsapp ? (
                            <ContactRow
                                action={canUseCustomerContactFlows ? { href: whatsappDirectUrl ?? '#', onClick: (event) => onWhatsAppClick(event, 'sidebar_card'), external: true } : null}
                                emphasized={contactVariant === 'emphasis' && canUseCustomerContactFlows}
                                icon="WA"
                                label="WhatsApp"
                                tone="success"
                                value={contactVariant === 'emphasis' && canUseCustomerContactFlows ? 'Chatea ahora' : business.whatsapp}
                            />
                        ) : null}
                        <ContactRow icon="Dir" label="Direccion" tone="primary" value={business.address} />
                        {business.website ? <ContactRow action={{ href: business.website, external: true }} icon="Web" label="Sitio web" tone="neutral" value={business.website} /> : null}
                        {business.email ? <ContactRow action={{ href: `mailto:${business.email}` }} icon="Mail" label="Email" tone="neutral" value={business.email} /> : null}

                        {socialLinks.length > 0 ? (
                            <div className="rounded-xl border border-gray-200 bg-white p-3">
                                <div className="mb-2 text-xs text-gray-600">Redes sociales</div>
                                <div className="flex flex-wrap gap-2">
                                    {socialLinks.map((entry) => (
                                        <a key={entry.label} href={entry.href} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                                            {entry.label}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {recommendedContactHint ? (
                            <div className="rounded-[1.25rem] border border-primary-100 bg-primary-50/70 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">
                                    {recommendedContactHint.title}
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                                    {recommendedContactHint.description}
                                </p>
                            </div>
                        ) : null}

                        {business.whatsapp && canUseCustomerContactFlows ? (
                            <button
                                type="button"
                                onClick={() => void onOpenWhatsApp('sidebar_primary')}
                                className="btn-primary w-full text-sm"
                            >
                                Chatear ahora por WhatsApp
                            </button>
                        ) : null}

                        {hasBusinessHours ? (
                            <HoursCard
                                businessOpenNow={business.openNow}
                                hoursByDay={hoursByDay}
                                todayDayOfWeek={todayDayOfWeek}
                            />
                        ) : null}

                        {business.profileCompletenessScore !== undefined ? (
                            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Calidad de ficha</div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                    <div className="h-full bg-gradient-to-r from-primary-600 to-accent-500" style={{ width: `${profileCompleteness}%` }} />
                                </div>
                                <div className="mt-2 text-sm text-slate-700">{profileCompleteness}% completado</div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                        {hasOperatorRole ? (
                            <div className="mb-6 space-y-3">
                                <h3 className="font-display font-semibold text-gray-900">{isAdminRole ? 'Herramientas de moderacion' : 'Herramientas de gestion'}</h3>
                                <p className="text-sm text-slate-700">
                                    {isAdminRole
                                        ? 'Revisa verificaciones, calidad de datos y cumplimiento desde el panel administrativo.'
                                        : 'Gestiona tu operacion comercial, mensajes y publicaciones desde tu panel de negocio.'}
                                </p>
                                <Link to={isAdminRole ? '/admin' : '/dashboard'} className="btn-secondary inline-flex text-sm">
                                    {isAdminRole ? 'Ir a Panel Admin' : 'Ir a Panel Negocio'}
                                </Link>
                            </div>
                        ) : null}
                        {!hasOperatorRole ? (
                            <>
                                {showBookings && isAuthenticated && isCustomerRole && canBookThisBusiness ? (
                                    <div className="mb-6">
                                        <h3 className="mb-3 font-display font-semibold text-gray-900">Reservar ahora</h3>
                                        <form onSubmit={onBookingSubmit} className="space-y-3">
                                            <input
                                                type="datetime-local"
                                                className="input-field text-sm"
                                                value={bookingForm.scheduledFor}
                                                onChange={(event) => onBookingFormChange((previous) => ({ ...previous, scheduledFor: event.target.value }))}
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                className="input-field text-sm"
                                                placeholder="Cantidad de personas"
                                                value={bookingForm.partySize}
                                                onChange={(event) => onBookingFormChange((previous) => ({ ...previous, partySize: event.target.value }))}
                                            />
                                            <textarea
                                                className="input-field text-sm"
                                                rows={2}
                                                placeholder="Notas de la reserva (opcional)"
                                                value={bookingForm.notes}
                                                onChange={(event) => onBookingFormChange((previous) => ({ ...previous, notes: event.target.value }))}
                                            />
                                            <button type="submit" className="btn-primary w-full text-sm" disabled={submittingBooking}>
                                                {submittingBooking ? 'Enviando reserva...' : 'Enviar reserva'}
                                            </button>
                                        </form>
                                        {bookingErrorMessage ? <InlineMessage tone="error">{bookingErrorMessage}</InlineMessage> : null}
                                        {bookingSuccessMessage ? <InlineMessage tone="success">{bookingSuccessMessage}</InlineMessage> : null}
                                    </div>
                                ) : null}

                                {showBookings && isAuthenticated && isCustomerRole && !canBookThisBusiness ? (
                                    <div className="mb-6 rounded-xl border border-primary-100 bg-primary-50/60 p-4 text-sm text-slate-700">
                                        Este negocio no gestiona reservas en linea. Usa los canales de contacto disponibles para coordinar.
                                    </div>
                                ) : null}

                                {showMessaging ? (
                                    <>
                                        <h3 className="mb-3 font-display font-semibold text-gray-900">Mensaje directo</h3>

                                        {!isAuthenticated ? (
                                            <form onSubmit={onPublicLeadSubmit} className="space-y-3">
                                                <p className="text-sm leading-relaxed text-slate-600">
                                                    Pide informacion, horarios o precios sin crear cuenta. Si luego quieres dar seguimiento, puedes iniciar sesion.
                                                </p>
                                                <input
                                                    className="input-field text-sm"
                                                    placeholder="Tu nombre"
                                                    value={publicLeadForm.contactName}
                                                    onChange={(event) => onPublicLeadFormChange((previous) => ({ ...previous, contactName: event.target.value }))}
                                                />
                                                <input
                                                    className="input-field text-sm"
                                                    placeholder="Tu telefono"
                                                    value={publicLeadForm.contactPhone}
                                                    onChange={(event) => onPublicLeadFormChange((previous) => ({ ...previous, contactPhone: event.target.value }))}
                                                />
                                                <input
                                                    className="input-field text-sm"
                                                    placeholder="Tu email (opcional)"
                                                    value={publicLeadForm.contactEmail}
                                                    onChange={(event) => onPublicLeadFormChange((previous) => ({ ...previous, contactEmail: event.target.value }))}
                                                />
                                                <textarea
                                                    className="input-field text-sm"
                                                    rows={3}
                                                    placeholder="Que necesitas confirmar?"
                                                    value={publicLeadForm.message}
                                                    onChange={(event) => onPublicLeadFormChange((previous) => ({ ...previous, message: event.target.value }))}
                                                />
                                                <button type="submit" className="btn-primary w-full text-sm" disabled={submittingPublicLead}>
                                                    {submittingPublicLead ? 'Enviando...' : 'Enviar consulta sin cuenta'}
                                                </button>
                                                <p className="text-xs text-gray-500">
                                                    Ya tienes cuenta? <Link to="/login" className="font-medium underline">Inicia sesion</Link>
                                                </p>
                                            </form>
                                        ) : null}

                                        {isAuthenticated && isCustomerRole ? (
                                            <form onSubmit={onMessageSubmit} className="space-y-3">
                                                <p className="text-sm leading-relaxed text-slate-600">
                                                    Incluye fecha, cantidad y contexto para que el negocio pueda responderte con algo mas util.
                                                </p>
                                                <input
                                                    className="input-field text-sm"
                                                    placeholder="Asunto (opcional)"
                                                    value={messageForm.subject}
                                                    onChange={(event) => onMessageFormChange((previous) => ({ ...previous, subject: event.target.value }))}
                                                />
                                                <textarea
                                                    className="input-field text-sm"
                                                    rows={3}
                                                    placeholder="Escribe tu consulta..."
                                                    value={messageForm.content}
                                                    onChange={(event) => onMessageFormChange((previous) => ({ ...previous, content: event.target.value }))}
                                                />
                                                <button type="submit" className="btn-primary w-full text-sm sm:w-auto" disabled={sendingMessage}>
                                                    {sendingMessage ? 'Enviando...' : 'Enviar mensaje'}
                                                </button>
                                            </form>
                                        ) : null}

                                        {publicLeadErrorMessage ? <InlineMessage tone="error">{publicLeadErrorMessage}</InlineMessage> : null}
                                        {publicLeadSuccessMessage ? <InlineMessage tone="success">{publicLeadSuccessMessage}</InlineMessage> : null}
                                        {messageErrorMessage ? <InlineMessage tone="error">{messageErrorMessage}</InlineMessage> : null}
                                        {messageSuccessMessage ? <InlineMessage tone="success">{messageSuccessMessage}</InlineMessage> : null}
                                    </>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface PillLabelProps {
    children: React.ReactNode;
    subtle?: boolean;
}

function PillLabel({ children, subtle = false }: PillLabelProps) {
    return (
        <span className={`rounded-full border border-white/20 px-2.5 py-1 text-xs font-medium ${subtle ? 'bg-white/10 text-white/85' : 'bg-white/15 text-white'}`}>
            {children}
        </span>
    );
}

interface MetricCardProps {
    label: string;
    value: string;
}

function MetricCard({ label, value }: MetricCardProps) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-sm font-semibold text-slate-900">{value}</p>
        </div>
    );
}

interface ContactRowProps {
    action?: {
        external?: boolean;
        href: string;
        onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    } | null;
    emphasized?: boolean;
    icon: string;
    label: string;
    tone: 'neutral' | 'primary' | 'success';
    value: string;
}

function ContactRow({ action, emphasized = false, icon, label, tone, value }: ContactRowProps) {
    const toneClasses = tone === 'success'
        ? emphasized
            ? 'border border-accent-200 bg-accent-50 shadow-sm hover:bg-accent-100'
            : 'border border-primary-200 bg-primary-50 hover:bg-primary-100'
        : tone === 'primary'
            ? 'border border-primary-100 bg-primary-50/50 hover:bg-primary-100'
            : 'border border-gray-200 bg-white hover:border-primary-200';
    const valueClasses = tone === 'success' ? 'text-primary-700' : tone === 'neutral' ? 'text-primary-700 break-all' : 'text-gray-700';
    const content = (
        <>
            <span className="text-lg">{icon}</span>
            <div>
                <div className="text-xs text-gray-600">{label}</div>
                <div className={`text-sm ${action && tone === 'primary' ? 'font-medium group-hover:text-primary-700 ' : ''}${valueClasses}`}>{value}</div>
            </div>
        </>
    );

    if (!action) {
        return (
            <div className={`flex items-center gap-3 rounded-xl border p-3 ${tone === 'success' ? 'border-primary-200 bg-primary-50/60' : 'border-primary-100 bg-primary-50/40'}`}>
                {content}
            </div>
        );
    }

    return (
        <a
            href={action.href}
            target={action.external ? '_blank' : undefined}
            rel={action.external ? 'noopener noreferrer' : undefined}
            onClick={action.onClick}
            className={`group flex items-center gap-3 rounded-xl p-3 transition-colors hover-lift ${toneClasses}`}
        >
            {content}
        </a>
    );
}

interface HoursCardProps {
    businessOpenNow?: boolean | null;
    hoursByDay: HoursByDayEntry[];
    todayDayOfWeek: number;
}

function HoursCard({ businessOpenNow, hoursByDay, todayDayOfWeek }: HoursCardProps) {
    return (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Horario</div>
                {businessOpenNow !== null && businessOpenNow !== undefined ? (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${businessOpenNow ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500'}`}>
                        {businessOpenNow ? 'Abierto ahora' : 'Cerrado ahora'}
                    </span>
                ) : null}
            </div>
            <div className="space-y-2">
                {hoursByDay.map((day) => (
                    <div key={day.dayOfWeek} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-b-0 last:pb-0">
                        <span className={day.dayOfWeek === todayDayOfWeek ? 'font-semibold text-primary-700' : 'text-slate-600'}>{day.label}</span>
                        <span className={day.dayOfWeek === todayDayOfWeek ? 'font-semibold text-primary-700' : 'text-slate-900'}>
                            {day.schedule?.closed ? 'Cerrado' : formatHoursRange(day.schedule?.opensAt, day.schedule?.closesAt) || 'Sin horario'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface InlineMessageProps {
    children: React.ReactNode;
    tone: 'error' | 'success';
}

function InlineMessage({ children, tone }: InlineMessageProps) {
    return (
        <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-primary-200 bg-primary-50 text-primary-700'}`}>
            {children}
        </div>
    );
}
