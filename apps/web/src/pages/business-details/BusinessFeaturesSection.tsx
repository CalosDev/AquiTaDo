import type { BusinessFeatureEntry } from './types';

type BusinessFeaturesSectionProps = {
    features: readonly BusinessFeatureEntry[];
};

export function BusinessFeaturesSection({ features }: BusinessFeaturesSectionProps) {
    return (
        <div className="mt-6">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Caracteristicas</h2>
            <div className="flex flex-wrap gap-2">
                {features.map((bf, i) => (
                    <span
                        key={i}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                    >
                        {bf.feature.name}
                    </span>
                ))}
            </div>
        </div>
    );
}
