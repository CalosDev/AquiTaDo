import type { ComponentProps, ReactNode } from 'react';
import { AppCard, DataTableWrapper, InlineNotice, SectionHeader } from './Foundation';
import { EmptyState } from './EmptyState';
import { SummaryCard } from './SummaryCard';

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

interface HeaderMetric {
    label: string;
    value: ReactNode;
    delta?: ReactNode;
}

interface KPIHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    metrics?: HeaderMetric[];
    className?: string;
}

export function KPIHeader({
    eyebrow,
    title,
    description,
    actions,
    metrics = [],
    className = '',
}: KPIHeaderProps) {
    return (
        <div className={cx('space-y-5', className)}>
            <SectionHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
            {metrics.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {metrics.map((metric) => (
                        <SummaryCard
                            key={metric.label}
                            label={metric.label}
                            value={metric.value}
                            delta={metric.delta}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

interface ClaimStatusBannerProps {
    title: string;
    description: string;
    statusLabel: string;
    statusClassName: string;
    summary?: ReactNode;
    note?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
}

export function ClaimStatusBanner({
    title,
    description,
    statusLabel,
    statusClassName,
    summary,
    note,
    actions,
    children,
    className = '',
}: ClaimStatusBannerProps) {
    return (
        <AppCard
            tone="status"
            title={title}
            description={description}
            className={className}
            actions={(
                <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-full px-3 py-1.5 text-xs font-semibold', statusClassName)}>
                        {statusLabel}
                    </span>
                    {actions}
                </div>
            )}
        >
            {summary ? (
                <div className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                </div>
            ) : null}
            {note ? (
                <InlineNotice
                    tone="warning"
                    title="Comentario del equipo"
                    body={note}
                    className={summary ? 'mt-4' : ''}
                />
            ) : null}
            {children ? <div className={note || summary ? 'mt-4' : ''}>{children}</div> : null}
        </AppCard>
    );
}

interface VerificationChecklistItem {
    label: string;
    detail: string;
    done: boolean;
}

interface VerificationChecklistProps {
    items: VerificationChecklistItem[];
    title?: string;
    description?: string;
    className?: string;
}

export function VerificationChecklist({
    items,
    title = 'Checklist rapido',
    description = 'Completa primero lo basico y despues envia la solicitud.',
    className = '',
}: VerificationChecklistProps) {
    return (
        <AppCard tone="queue" title={title} description={description} className={className}>
            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-3">
                        <span
                            className={cx(
                                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                            )}
                        >
                            {item.done ? 'OK' : '!'}
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                        </div>
                    </div>
                ))}
            </div>
        </AppCard>
    );
}

interface DocumentUploadCardProps {
    title?: string;
    description?: string;
    footer?: ReactNode;
    className?: string;
    children: ReactNode;
}

export function DocumentUploadCard({
    title = 'Subir documento',
    description = 'Usa archivos claros y legibles para que el equipo pueda revisarlos sin retrasos.',
    footer,
    className = '',
    children,
}: DocumentUploadCardProps) {
    return (
        <AppCard title={title} description={description} className={className}>
            {children}
            {footer ? <div className="mt-4">{footer}</div> : null}
        </AppCard>
    );
}

interface PendingReviewPanelProps {
    title?: string;
    description?: string;
    summaryTitle?: string;
    summaryBody: ReactNode;
    action?: ReactNode;
    supportingCopy?: ReactNode;
    className?: string;
}

export function PendingReviewPanel({
    title = 'Solicitar revision',
    description = 'Haz la solicitud cuando ya tengas cargados los documentos principales.',
    summaryTitle = 'Antes de enviar',
    summaryBody,
    action,
    supportingCopy,
    className = '',
}: PendingReviewPanelProps) {
    return (
        <AppCard title={title} description={description} className={className}>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{summaryTitle}</p>
                <div className="mt-2 text-sm leading-6 text-slate-700">{summaryBody}</div>
            </div>
            {action ? <div className="mt-4">{action}</div> : null}
            {supportingCopy ? <div className="mt-3 text-xs leading-5 text-slate-500">{supportingCopy}</div> : null}
        </AppCard>
    );
}

interface NextStepCardProps {
    title: string;
    body: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function NextStepCard({ title, body, action, className = '' }: NextStepCardProps) {
    return (
        <AppCard tone="insight" title={title} className={className}>
            <div className="text-sm leading-6 text-slate-700">{body}</div>
            {action ? <div className="mt-4">{action}</div> : null}
        </AppCard>
    );
}

interface TrendRow {
    id: string;
    label: string;
    meta?: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
}

interface TrendPanelProps {
    title: string;
    description?: string;
    rows: TrendRow[];
    actions?: ReactNode;
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}

export function TrendPanel({
    title,
    description,
    rows,
    actions,
    emptyTitle = 'Sin datos todavia',
    emptyBody = 'Cuando haya actividad, el resumen aparecera aqui.',
    className = '',
}: TrendPanelProps) {
    return (
        <AppCard tone="insight" title={title} description={description} actions={actions} className={className}>
            {rows.length > 0 ? (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div key={row.id} className="rounded-[20px] border border-white bg-white px-4 py-3 shadow-sm shadow-slate-900/5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{row.label}</p>
                                    {row.meta ? <div className="mt-1 text-xs text-slate-500">{row.meta}</div> : null}
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{row.value}</p>
                                    {row.detail ? <div className="mt-1 text-xs text-slate-500">{row.detail}</div> : null}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState title={emptyTitle} body={emptyBody} />
            )}
        </AppCard>
    );
}

type BillingSummaryCardProps = ComponentProps<typeof SummaryCard>;

export function BillingSummaryCard(props: BillingSummaryCardProps) {
    return <SummaryCard {...props} />;
}

interface PlanStatusCardProps {
    code: string;
    name: string;
    price: ReactNode;
    priceSuffix?: ReactNode;
    description?: string;
    badge?: ReactNode;
    features: ReactNode[];
    footer?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function PlanStatusCard({
    code,
    name,
    price,
    priceSuffix,
    description,
    badge,
    features,
    footer,
    action,
    className = '',
}: PlanStatusCardProps) {
    return (
        <AppCard
            title={name}
            description={description}
            className={cx('h-full', className)}
            actions={badge}
        >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{code}</p>
            <div className="mt-3 flex flex-nowrap items-end gap-1 text-slate-900">
                <p className="text-3xl font-bold leading-none">{price}</p>
                {priceSuffix ? (
                    <span className="whitespace-nowrap text-base font-medium leading-none text-slate-500">
                        {priceSuffix}
                    </span>
                ) : null}
            </div>
            <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                {features.map((feature, index) => (
                    <p key={index}>{feature}</p>
                ))}
            </div>
            {footer ? <div className="mt-4">{footer}</div> : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </AppCard>
    );
}

interface EntityListItemProps {
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    body?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function EntityListItem({
    title,
    subtitle,
    badge,
    body,
    meta,
    actions,
    className = '',
}: EntityListItemProps) {
    return (
        <article className={cx('rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5', className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        {badge}
                    </div>
                    {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
                </div>
                {meta ? <div className="text-right text-xs text-slate-500">{meta}</div> : null}
            </div>
            {body ? <div className="mt-3">{body}</div> : null}
            {actions ? <div className="mt-4">{actions}</div> : null}
        </article>
    );
}

interface TimelineBlockItem {
    id: string;
    title: ReactNode;
    meta?: ReactNode;
    body?: ReactNode;
    badge?: ReactNode;
}

interface TimelineBlockProps {
    title: string;
    description?: string;
    items: TimelineBlockItem[];
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}

export function TimelineBlock({
    title,
    description,
    items,
    emptyTitle = 'Sin historial disponible',
    emptyBody = 'Cuando haya movimiento, lo veras aqui.',
    className = '',
}: TimelineBlockProps) {
    return (
        <DataTableWrapper title={title} description={description} className={className}>
            {items.length > 0 ? (
                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.id} className="relative rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
                            <div className="absolute left-0 top-5 h-10 w-1 rounded-full bg-slate-100" aria-hidden="true" />
                            <div className="pl-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                                        {item.meta ? <div className="mt-1 text-xs text-slate-500">{item.meta}</div> : null}
                                    </div>
                                    {item.badge}
                                </div>
                                {item.body ? <div className="mt-3 text-sm leading-6 text-slate-600">{item.body}</div> : null}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState title={emptyTitle} body={emptyBody} />
            )}
        </DataTableWrapper>
    );
}

interface InlineErrorStateProps {
    title?: string;
    body: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function InlineErrorState({
    title = 'Hay algo por corregir',
    body,
    action,
    className = '',
}: InlineErrorStateProps) {
    return (
        <InlineNotice tone="danger" title={title} body={body} action={action} className={className} />
    );
}

interface InvoiceTableItem {
    id: string;
    title: ReactNode;
    meta?: ReactNode;
    statusLabel: ReactNode;
    statusClassName: string;
    amount: ReactNode;
    detail?: ReactNode;
    links?: ReactNode;
}

interface InvoiceTableProps {
    title: string;
    description?: string;
    items: InvoiceTableItem[];
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}

export function InvoiceTable({
    title,
    description,
    items,
    emptyTitle = 'Sin movimientos registrados',
    emptyBody = 'Cuando haya actividad, aparecera aqui.',
    className = '',
}: InvoiceTableProps) {
    return (
        <DataTableWrapper title={title} description={description} className={className}>
            {items.length > 0 ? (
                <div className="space-y-3">
                    {items.map((item) => (
                        <EntityListItem
                            key={item.id}
                            title={item.title}
                            subtitle={item.meta}
                            badge={<span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', item.statusClassName)}>{item.statusLabel}</span>}
                            body={(
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-slate-900">{item.amount}</p>
                                    {item.detail ? <div className="text-sm leading-6 text-slate-600">{item.detail}</div> : null}
                                    {item.links ? <div className="text-xs text-slate-500">{item.links}</div> : null}
                                </div>
                            )}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState title={emptyTitle} body={emptyBody} />
            )}
        </DataTableWrapper>
    );
}

interface PromotionListItem {
    id: string;
    title: string;
    subtitle: ReactNode;
    statusLabel: string;
    statusClassName: string;
    badges?: ReactNode;
    meta?: ReactNode;
    description?: ReactNode;
    value: ReactNode;
    code?: ReactNode;
    actions?: ReactNode;
}

interface PromotionListProps {
    title: string;
    description?: string;
    items: PromotionListItem[];
    filters?: ReactNode;
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}

export function PromotionList({
    title,
    description,
    items,
    filters,
    emptyTitle = 'Sin promociones para este filtro',
    emptyBody = 'Cuando publiques nuevas ofertas, apareceran aqui.',
    className = '',
}: PromotionListProps) {
    return (
        <DataTableWrapper title={title} description={description} className={className}>
            {filters ? <div className="mb-4">{filters}</div> : null}
            {items.length > 0 ? (
                <div className="space-y-3">
                    {items.map((item) => (
                        <EntityListItem
                            key={item.id}
                            title={item.title}
                            subtitle={item.subtitle}
                            badge={(
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', item.statusClassName)}>
                                        {item.statusLabel}
                                    </span>
                                    {item.badges}
                                </div>
                            )}
                            meta={item.meta}
                            body={(
                                <div className="space-y-3">
                                    <div className="text-sm font-semibold text-slate-900">{item.value}</div>
                                    {item.code ? <div className="text-xs text-slate-500">{item.code}</div> : null}
                                    {item.description ? (
                                        <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                                            {item.description}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                            actions={item.actions}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState title={emptyTitle} body={emptyBody} />
            )}
        </DataTableWrapper>
    );
}

interface CampaignStat {
    label: string;
    value: ReactNode;
}

interface CampaignTableItem {
    id: string;
    title: string;
    subtitle: ReactNode;
    statusLabel: string;
    statusClassName: string;
    period: ReactNode;
    performance: ReactNode;
    stats: CampaignStat[];
    targeting?: ReactNode;
    actions?: ReactNode;
}

interface CampaignTableProps {
    title: string;
    description?: string;
    items: CampaignTableItem[];
    filters?: ReactNode;
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}

export function CampaignTable({
    title,
    description,
    items,
    filters,
    emptyTitle = 'Sin campanas para este filtro',
    emptyBody = 'Cuando lances nuevas campanas, apareceran aqui.',
    className = '',
}: CampaignTableProps) {
    return (
        <DataTableWrapper title={title} description={description} className={className}>
            {filters ? <div className="mb-4">{filters}</div> : null}
            {items.length > 0 ? (
                <div className="space-y-3">
                    {items.map((item) => (
                        <EntityListItem
                            key={item.id}
                            title={item.title}
                            subtitle={item.subtitle}
                            badge={<span className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', item.statusClassName)}>{item.statusLabel}</span>}
                            meta={item.performance}
                            body={(
                                <div className="space-y-3">
                                    <div className="text-xs text-slate-500">{item.period}</div>
                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                        {item.stats.map((stat) => (
                                            <div key={stat.label} className="rounded-xl bg-slate-50 px-3 py-3">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
                                                <p className="mt-2 text-sm font-semibold text-slate-900">{stat.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {item.targeting ? <div className="text-xs text-slate-500">{item.targeting}</div> : null}
                                </div>
                            )}
                            actions={item.actions}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState title={emptyTitle} body={emptyBody} />
            )}
        </DataTableWrapper>
    );
}
