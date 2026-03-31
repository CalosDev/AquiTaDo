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
        <div className={`rounded-2xl border p-5 ${
            submissionGuidance.blockedByLocalHeuristics
                ? 'border-red-200 bg-red-50'
                : submissionGuidance.readinessLevel === 'ALTA'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
        }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Guia de publicacion</p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900">
                        Visibilidad {submissionGuidance.readinessLevel} · Score {submissionGuidance.readinessScore}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                        {completedVisibilityChecks} de {submissionGuidance.visibilityChecks.length} checks listos
                        {submissionGuidance.riskClusters.length > 0 ? ` - Riesgos: ${submissionGuidance.riskClusters.join(', ')}` : ''}
                    </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    submissionGuidance.blockedByLocalHeuristics
                        ? 'bg-red-100 text-red-700'
                        : 'bg-white text-gray-700'
                }`}>
                    Riesgo preventivo {submissionGuidance.preventiveScore}/100 - {submissionGuidance.preventiveSeverity}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                    <p className="text-sm font-medium text-gray-900">En este paso conviene cuidar</p>
                    <ul className="mt-2 space-y-2 text-sm text-gray-700">
                        {currentStepTips.map((tip) => (
                            <li key={tip}>{tip}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-900">Checklist de visibilidad</p>
                    <div className="mt-2 space-y-2">
                        {submissionGuidance.visibilityChecks.map((check) => (
                            <div key={check.label} className="rounded-xl bg-white/80 px-3 py-2">
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
                <div className="mt-4 rounded-xl bg-white/80 px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">Aun falta para publicar con buena calidad</p>
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
                <div className="mt-4">
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
