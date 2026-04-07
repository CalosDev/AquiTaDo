export type PageFeedbackTone = 'danger' | 'info' | 'success' | 'warning';

export interface PageFeedbackItem {
    id?: string;
    tone: PageFeedbackTone;
    text: string;
    role?: 'alert' | 'status';
    live?: 'assertive' | 'polite';
}

interface PageFeedbackStackProps {
    items: PageFeedbackItem[];
}

function resolveToneClass(tone: PageFeedbackTone) {
    switch (tone) {
        case 'danger':
            return 'alert-danger';
        case 'warning':
            return 'alert-warning';
        case 'success':
            return 'alert-success';
        default:
            return 'alert-info';
    }
}

export function PageFeedbackStack({ items }: PageFeedbackStackProps) {
    const visibleItems = items.filter((item) => item.text.trim().length > 0);

    if (visibleItems.length === 0) {
        return null;
    }

    return (
        <div className="page-feedback-stack" aria-live="polite" aria-relevant="additions text">
            {visibleItems.map((item, index) => (
                <section
                    key={item.id ?? `${item.tone}-${index}`}
                    role={item.role ?? (item.tone === 'danger' ? 'alert' : 'status')}
                    aria-live={item.live ?? (item.tone === 'danger' ? 'assertive' : 'polite')}
                    className={`page-feedback-card ${resolveToneClass(item.tone)}`}
                >
                    <p>{item.text}</p>
                </section>
            ))}
        </div>
    );
}
