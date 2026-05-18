import type { BusinessSubmissionGuidance } from '../../lib/businessSubmissionGuidance';

type PublicationGuidancePanelProps = {
    submissionGuidance: BusinessSubmissionGuidance;
    currentStepTips: string[];
    completedVisibilityChecks: number;
    remainingPublishNeeds: string[];
};

export function PublicationGuidancePanel({
    submissionGuidance,
    currentStepTips,
    completedVisibilityChecks,
    remainingPublishNeeds,
}: PublicationGuidancePanelProps) {
    return (
        <div className={`rounded-2xl border p-4 sm:p-5 ${
            submissionGuidance.blockedByLocalHeuristics
                ? 'border-red-200 bg-red-50/70'
                : submissionGuidance.readinessLevel === 'ALTA'
                    ? 'border-primary-200 bg-primary-50/70'
                    : 'border-amber-200 bg-amber-50/60'
        }`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Revision final</p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900">
                        Estado {submissionGuidance.readinessLevel} · Puntaje {submissionGuidance.readinessScore}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                        {completedVisibilityChecks} de {submissionGuidance.visibilityChecks.length} puntos completos
                        {submissionGuidance.riskClusters.length > 0 ? ` - Revisa: ${submissionGuidance.riskClusters.join(', ')}` : ''}
                    </p>
                </div>
                <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${
                    submissionGuidance.blockedByLocalHeuristics
                        ? 'bg-red-100 text-red-700'
                        : 'bg-white/85 text-gray-700'
                }`}>
                    Alertas {submissionGuidance.preventiveScore}/100 - {submissionGuidance.preventiveSeverity}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="border-l border-white/70 pl-3">
                    <p className="text-sm font-medium text-gray-900">En este paso conviene cuidar</p>
                    <ul className="mt-2 space-y-2 text-sm text-gray-700">
                        {currentStepTips.map((tip) => (
                            <li key={tip}>{tip}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-900">Checklist de publicacion</p>
                    <div className="mt-2 space-y-2">
                        {submissionGuidance.visibilityChecks.map((check) => (
                            <div key={check.label} className="rounded-xl bg-white/70 px-3 py-2">
                                <p className="text-sm font-medium text-gray-900">
                                    {check.passed ? 'Listo' : 'Pendiente'} · {check.label}
                                </p>
                                <p className="mt-1 text-xs text-gray-600">{check.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {remainingPublishNeeds.length > 0 ? (
                <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 sm:px-4">
                    <p className="text-sm font-medium text-gray-900">Todavia falta antes de publicar</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {remainingPublishNeeds.map((item) => (
                            <span key={item} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}

            {submissionGuidance.recommendedActions.length > 0 ? (
                <div className="mt-3 border-t border-white/70 pt-3">
                    <p className="text-sm font-medium text-gray-900">Acciones sugeridas</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {submissionGuidance.recommendedActions.slice(0, 4).map((action) => (
                            <li key={action}>{action}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
