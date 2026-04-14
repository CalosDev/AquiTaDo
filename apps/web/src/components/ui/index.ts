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
 *   NoPermissionState — sin acceso
 *
 * Nota: FilterCard, ListCard y FormCard se implementan
 * directamente con las clases CSS card-filter / card-list / card-form
 * por ser más estructurales y variar mucho por módulo.
 */

export { SummaryCard } from './SummaryCard';
export { SectionCard } from './SectionCard';
export { EmptyState } from './EmptyState';
export { LoadingState } from './LoadingState';
export { ErrorState } from './ErrorState';
export { NoPermissionState } from './NoPermissionState';
