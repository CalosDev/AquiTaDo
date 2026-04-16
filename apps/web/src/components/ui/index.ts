/**
 * UI Components — Barrel export
 * AquiTaDo Blueprint § 7 & § 10
 *
 * Tipos de card oficiales (§ 7.1):
 *   SummaryCard  — métricas y KPIs
 *   SectionCard  — módulos funcionales
 *
 * Estados UX obligatorios (§ 10):
 *   EmptyState       — sin datos
 *   LoadingState     — cargando
 *   ErrorState       — error
 *   SuccessState     — exito
 *   PartialDataState — datos parciales
 *   NoPermissionState — sin acceso
 *   FeatureDisabledState — feature apagada
 *
 * Nota: FilterCard, ListCard y FormCard se implementan
 * directamente con las clases CSS card-filter / card-list / card-form
 * por ser más estructurales y variar mucho por módulo.
 */

export { SummaryCard } from './SummaryCard';
export { SectionCard } from './SectionCard';
export {
    ActionBar,
    AppCard,
    DashboardContentLayout,
    DataTableWrapper,
    EmptyStateCard,
    FieldError,
    FieldHint,
    FilterBar,
    FormPageLayout,
    FormSection,
    InfoList,
    InlineChoiceGroup,
    InlineNotice,
    InsightCard,
    MetricCard,
    PageIntroCompact,
    PageShell,
    PendingReviewState,
    PermissionState,
    PublicPageShell,
    QueueCard,
    SectionHeader,
    SplitPanelLayout,
    StatGroup,
    StatusCard,
    StickyFormActions,
    Toolbar,
} from './Foundation';
export { EmptyState } from './EmptyState';
export { LoadingState } from './LoadingState';
export { ErrorState } from './ErrorState';
export { SuccessState } from './SuccessState';
export { PartialDataState } from './PartialDataState';
export { NoPermissionState } from './NoPermissionState';
export { FeatureDisabledState } from './FeatureDisabledState';
export { default as SkeletonLoader } from './SkeletonLoader';
export { default as TrustScore } from './TrustScore';
export { default as VerificationBadge } from './VerificationBadge';
