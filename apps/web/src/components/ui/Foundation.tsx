import type { ComponentProps, ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { NoPermissionState } from './NoPermissionState';
import { SummaryCard } from './SummaryCard';

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

type ShellWidth = 'narrow' | 'default' | 'wide' | 'full';
type ShellTag = 'div' | 'section' | 'article' | 'main';
type SectionHeaderTone = 'default' | 'subtle';
type NoticeTone = 'info' | 'success' | 'warning' | 'danger';
type ChoiceColumns = 1 | 2 | 3;

interface PageShellProps {
    children: ReactNode;
    className?: string;
    as?: ShellTag;
    width?: ShellWidth;
    id?: string;
}

const pageShellWidthClass: Record<ShellWidth, string> = {
    narrow: 'page-shell--narrow',
    default: 'page-shell--default',
    wide: 'page-shell--wide',
    full: 'page-shell--full',
};

export function PageShell({
    children,
    className = '',
    as: Tag = 'section',
    width = 'default',
    id,
}: PageShellProps) {
    return (
        <Tag id={id} className={cx('page-shell', pageShellWidthClass[width], className)}>
            {children}
        </Tag>
    );
}

export function PublicPageShell({ className = '', ...props }: PageShellProps) {
    return <PageShell {...props} className={cx('public-page-shell', className)} />;
}

interface DashboardContentLayoutProps {
    primary: ReactNode;
    secondary?: ReactNode;
    className?: string;
}

export function DashboardContentLayout({
    primary,
    secondary,
    className = '',
}: DashboardContentLayoutProps) {
    return (
        <div
            className={cx(
                'dashboard-content-layout',
                secondary ? 'dashboard-content-layout--with-secondary' : 'dashboard-content-layout--single',
                className,
            )}
        >
            <div className="dashboard-content-layout__primary">{primary}</div>
            {secondary ? <aside className="dashboard-content-layout__secondary">{secondary}</aside> : null}
        </div>
    );
}

interface SplitPanelLayoutProps {
    primary: ReactNode;
    secondary: ReactNode;
    aside?: ReactNode;
    className?: string;
}

export function SplitPanelLayout({
    primary,
    secondary,
    aside,
    className = '',
}: SplitPanelLayoutProps) {
    return (
        <div
            className={cx(
                'split-panel-layout',
                aside ? 'split-panel-layout--with-aside' : 'split-panel-layout--two',
                className,
            )}
        >
            <section className="split-panel-layout__panel">{primary}</section>
            <section className="split-panel-layout__panel">{secondary}</section>
            {aside ? <aside className="split-panel-layout__aside">{aside}</aside> : null}
        </div>
    );
}

interface SectionHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
    className?: string;
    tone?: SectionHeaderTone;
}

export function SectionHeader({
    eyebrow,
    title,
    description,
    actions,
    className = '',
    tone = 'default',
}: SectionHeaderProps) {
    return (
        <header className={cx('section-header', `section-header--${tone}`, className)}>
            <div className="section-header__copy">
                {eyebrow ? <p className="section-header__eyebrow">{eyebrow}</p> : null}
                <h2 className="section-header__title">{title}</h2>
                {description ? <p className="section-header__description">{description}</p> : null}
            </div>
            {actions ? <div className="section-header__actions">{actions}</div> : null}
        </header>
    );
}

type PageIntroCompactProps = Omit<SectionHeaderProps, 'tone'>;

export function PageIntroCompact(props: PageIntroCompactProps) {
    return <SectionHeader {...props} className={cx('page-intro-compact', props.className)} tone="subtle" />;
}

interface FormPageLayoutProps {
    eyebrow?: string;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function FormPageLayout({
    eyebrow,
    title,
    description,
    children,
    footer,
    actions,
    className = '',
}: FormPageLayoutProps) {
    return (
        <section className={cx('form-page-layout', className)}>
            <SectionHeader
                eyebrow={eyebrow}
                title={title}
                description={description}
                actions={actions}
                className="form-page-layout__header"
            />
            <div className="form-page-layout__body">{children}</div>
            {footer ? <div className="form-page-layout__footer">{footer}</div> : null}
        </section>
    );
}

interface ActionBarProps {
    children: ReactNode;
    className?: string;
}

export function ActionBar({ children, className = '' }: ActionBarProps) {
    return <div className={cx('action-bar', className)}>{children}</div>;
}

interface ToolbarProps {
    leading?: ReactNode;
    trailing?: ReactNode;
    className?: string;
    children?: ReactNode;
}

export function Toolbar({ leading, trailing, className = '', children }: ToolbarProps) {
    if (children) {
        return <div className={cx('toolbar', className)}>{children}</div>;
    }

    return (
        <div className={cx('toolbar', className)}>
            <div className="toolbar__leading">{leading}</div>
            {trailing ? <div className="toolbar__trailing">{trailing}</div> : null}
        </div>
    );
}

interface FilterBarProps extends ToolbarProps {
    summary?: ReactNode;
}

export function FilterBar({
    leading,
    trailing,
    summary,
    className = '',
    children,
}: FilterBarProps) {
    if (children) {
        return <div className={cx('filter-bar', className)}>{children}</div>;
    }

    return (
        <div className={cx('filter-bar', className)}>
            <div className="filter-bar__leading">{leading}</div>
            {summary ? <div className="filter-bar__summary">{summary}</div> : null}
            {trailing ? <div className="filter-bar__trailing">{trailing}</div> : null}
        </div>
    );
}

interface AppCardProps {
    children: ReactNode;
    title?: string;
    description?: string;
    actions?: ReactNode;
    className?: string;
    as?: 'div' | 'section' | 'article';
    tone?: 'default' | 'status' | 'queue' | 'insight';
}

export function AppCard({
    children,
    title,
    description,
    actions,
    className = '',
    as: Tag = 'div',
    tone = 'default',
}: AppCardProps) {
    return (
        <Tag className={cx('app-card', `app-card--${tone}`, className)}>
            {title || description || actions ? (
                <div className="app-card__header">
                    <div>
                        {title ? <h3 className="app-card__title">{title}</h3> : null}
                        {description ? <p className="app-card__description">{description}</p> : null}
                    </div>
                    {actions ? <div className="app-card__actions">{actions}</div> : null}
                </div>
            ) : null}
            {children}
        </Tag>
    );
}

type SummaryCardProps = ComponentProps<typeof SummaryCard>;

export function MetricCard(props: SummaryCardProps) {
    return <SummaryCard {...props} />;
}

type BaseVariantCardProps = Omit<AppCardProps, 'tone'>;

export function StatusCard(props: BaseVariantCardProps) {
    return <AppCard {...props} tone="status" />;
}

export function QueueCard(props: BaseVariantCardProps) {
    return <AppCard {...props} tone="queue" />;
}

export function InsightCard(props: BaseVariantCardProps) {
    return <AppCard {...props} tone="insight" />;
}

type EmptyStateProps = ComponentProps<typeof EmptyState>;

interface EmptyStateCardProps extends EmptyStateProps {
    className?: string;
}

export function EmptyStateCard({ className = '', ...props }: EmptyStateCardProps) {
    return (
        <AppCard className={cx('empty-state-card', className)}>
            <EmptyState {...props} className="shadow-none" />
        </AppCard>
    );
}

interface DataTableWrapperProps {
    title?: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
}

export function DataTableWrapper({
    title,
    description,
    actions,
    children,
    footer,
    className = '',
}: DataTableWrapperProps) {
    return (
        <section className={cx('data-table-wrapper', className)}>
            {title || description || actions ? (
                <div className="data-table-wrapper__header">
                    <div>
                        {title ? <h3 className="data-table-wrapper__title">{title}</h3> : null}
                        {description ? <p className="data-table-wrapper__description">{description}</p> : null}
                    </div>
                    {actions ? <div className="data-table-wrapper__actions">{actions}</div> : null}
                </div>
            ) : null}
            <div className="data-table-wrapper__body">{children}</div>
            {footer ? <div className="data-table-wrapper__footer">{footer}</div> : null}
        </section>
    );
}

interface InfoListItem {
    label: string;
    value: ReactNode;
    hint?: string;
}

interface InfoListProps {
    items: InfoListItem[];
    className?: string;
}

export function InfoList({ items, className = '' }: InfoListProps) {
    return (
        <dl className={cx('info-list', className)}>
            {items.map((item) => (
                <div key={item.label} className="info-list__item">
                    <dt className="info-list__label">{item.label}</dt>
                    <dd className="info-list__value">
                        <div>{item.value}</div>
                        {item.hint ? <p className="info-list__hint">{item.hint}</p> : null}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

interface StatGroupItem {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}

interface StatGroupProps {
    items: StatGroupItem[];
    className?: string;
}

export function StatGroup({ items, className = '' }: StatGroupProps) {
    return (
        <div className={cx('stat-group', className)}>
            {items.map((item) => (
                <article key={item.label} className="stat-group__item">
                    <p className="stat-group__label">{item.label}</p>
                    <p className="stat-group__value">{item.value}</p>
                    {item.detail ? <p className="stat-group__detail">{item.detail}</p> : null}
                </article>
            ))}
        </div>
    );
}

interface InlineNoticeProps {
    title?: string;
    body: ReactNode;
    action?: ReactNode;
    tone?: NoticeTone;
    className?: string;
}

export function InlineNotice({
    title,
    body,
    action,
    tone = 'info',
    className = '',
}: InlineNoticeProps) {
    return (
        <div className={cx('inline-notice', `inline-notice--${tone}`, className)} role="status">
            <div className="inline-notice__copy">
                {title ? <p className="inline-notice__title">{title}</p> : null}
                <div className="inline-notice__body">{body}</div>
            </div>
            {action ? <div className="inline-notice__action">{action}</div> : null}
        </div>
    );
}

interface FormSectionProps {
    title?: string;
    description?: string;
    children: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function FormSection({
    title,
    description,
    children,
    actions,
    className = '',
}: FormSectionProps) {
    return (
        <section className={cx('form-section', className)}>
            {title || description || actions ? (
                <div className="form-section__header">
                    <div>
                        {title ? <h3 className="form-section__title">{title}</h3> : null}
                        {description ? <p className="form-section__description">{description}</p> : null}
                    </div>
                    {actions ? <div className="form-section__actions">{actions}</div> : null}
                </div>
            ) : null}
            <div className="form-section__body">{children}</div>
        </section>
    );
}

interface FieldHintProps {
    children: ReactNode;
    className?: string;
    id?: string;
}

export function FieldHint({ children, className = '', id }: FieldHintProps) {
    return (
        <p id={id} className={cx('field-hint', className)}>
            {children}
        </p>
    );
}

interface FieldErrorProps {
    children: ReactNode;
    className?: string;
    id?: string;
}

export function FieldError({ children, className = '', id }: FieldErrorProps) {
    return (
        <p id={id} className={cx('field-error', className)} role="alert">
            {children}
        </p>
    );
}

interface InlineChoiceOption<T extends string> {
    value: T;
    label: string;
    description?: string;
    support?: string;
    disabled?: boolean;
}

interface InlineChoiceGroupProps<T extends string> {
    name: string;
    value: T | '';
    options: ReadonlyArray<InlineChoiceOption<T>>;
    onChange: (nextValue: T) => void;
    legend?: string;
    hint?: ReactNode;
    className?: string;
    columns?: ChoiceColumns;
}

const choiceColumnsClass: Record<ChoiceColumns, string> = {
    1: 'inline-choice-group--1',
    2: 'inline-choice-group--2',
    3: 'inline-choice-group--3',
};

export function InlineChoiceGroup<T extends string>({
    name,
    value,
    options,
    onChange,
    legend,
    hint,
    className = '',
    columns = 2,
}: InlineChoiceGroupProps<T>) {
    return (
        <fieldset className={cx('inline-choice-group-wrap', className)}>
            {legend ? <legend className="inline-choice-group__legend">{legend}</legend> : null}
            <div className={cx('inline-choice-group', choiceColumnsClass[columns])}>
                {options.map((option) => {
                    const selected = value === option.value;

                    return (
                        <label
                            key={option.value}
                            className={cx(
                                'inline-choice-option',
                                selected && 'inline-choice-option--selected',
                                option.disabled && 'inline-choice-option--disabled',
                            )}
                        >
                            <input
                                type="radio"
                                name={name}
                                value={option.value}
                                checked={selected}
                                disabled={option.disabled}
                                onChange={() => onChange(option.value)}
                                className="sr-only"
                            />
                            <div className="inline-choice-option__body">
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'inline-choice-option__bullet',
                                        selected && 'inline-choice-option__bullet--selected',
                                    )}
                                >
                                    <span
                                        className={cx(
                                            'inline-choice-option__bullet-dot',
                                            selected && 'inline-choice-option__bullet-dot--selected',
                                        )}
                                    />
                                </span>
                                <div>
                                    <p className="inline-choice-option__label">{option.label}</p>
                                    {option.description ? (
                                        <p className="inline-choice-option__description">{option.description}</p>
                                    ) : null}
                                    {option.support ? (
                                        <p className="inline-choice-option__support">{option.support}</p>
                                    ) : null}
                                </div>
                            </div>
                        </label>
                    );
                })}
            </div>
            {hint ? <div className="mt-3">{hint}</div> : null}
        </fieldset>
    );
}

interface StickyFormActionsProps {
    children: ReactNode;
    className?: string;
}

export function StickyFormActions({ children, className = '' }: StickyFormActionsProps) {
    return <div className={cx('sticky-form-actions', className)}>{children}</div>;
}

type PermissionStateProps = ComponentProps<typeof NoPermissionState>;

export function PermissionState(props: PermissionStateProps) {
    return <NoPermissionState {...props} />;
}

interface PendingReviewStateProps {
    title?: string;
    body?: string;
    action?: ReactNode;
    className?: string;
}

export function PendingReviewState({
    title = 'En revisión',
    body = 'Recibimos tu solicitud y el equipo la está validando. Te avisaremos cuando cambie el estado.',
    action,
    className = '',
}: PendingReviewStateProps) {
    return (
        <div className={cx('ux-state-wrap', 'ux-state-wrap--compact', className)} role="status">
            <div className="ux-state-icon ux-state-icon--partial" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
                <p className="ux-state-title">{title}</p>
                {body ? <p className="ux-state-body">{body}</p> : null}
            </div>
            {action ? <div>{action}</div> : null}
        </div>
    );
}
