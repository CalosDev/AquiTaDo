import type { ReactNode } from 'react';
import { FormPageLayout, PageShell } from '../ui';

interface AuthPageShellProps {
    eyebrow: string;
    title: string;
    description: string;
    asideTitle: string;
    asideBody: string;
    asidePoints: string[];
    children: ReactNode;
    footer?: ReactNode;
}

export function AuthPageShell({
    eyebrow,
    title,
    description,
    asideTitle,
    asideBody,
    asidePoints,
    children,
    footer,
}: AuthPageShellProps) {
    return (
        <PageShell className="flex flex-1 items-center py-6 md:py-10" width="wide">
            <div className="auth-grid w-full">
                <aside className="auth-aside-card">
                    <div>
                        <p className="inline-flex rounded-full border border-white/18 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">
                            {eyebrow}
                        </p>
                        <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-white">
                            {asideTitle}
                        </h1>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100">
                            {asideBody}
                        </p>
                    </div>

                    <div className="grid gap-3">
                        {asidePoints.map((point) => (
                            <div key={point} className="auth-point">
                                <span
                                    aria-hidden="true"
                                    className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-white"
                                />
                                <span>{point}</span>
                            </div>
                        ))}
                    </div>

                    <div className="auth-mini-card mt-auto">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100/78">
                            AquiTa.do
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-100">
                            Discovery, operacion SaaS y administracion bajo un mismo sistema visual.
                        </p>
                    </div>
                </aside>

                <FormPageLayout
                    eyebrow={eyebrow}
                    title={title}
                    description={description}
                    footer={footer}
                    className="auth-form-card"
                >
                    {children}
                </FormPageLayout>
            </div>
        </PageShell>
    );
}
