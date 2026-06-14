import { CheckCircle2, Info, Mail, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const refundCards = [
    {
        title: 'Cancellation',
        points: [
            'You may request cancellation of a paid plan at any time. Access normally continues until the end of the active billing period unless stated otherwise.',
            'Cancellation stops future billing, but it does not automatically delete your account or historical records.',
        ],
    },
    {
        title: 'Refund eligibility',
        points: [
            'Refunds are reviewed against the purchase type, activation state, and whether the issue can first be resolved by support.',
            'Abuse, fraudulent payment disputes, or service misuse may make a refund request ineligible.',
        ],
    },
    {
        title: 'Processing',
        points: [
            'Approved refunds are initiated after validation and may still take additional banking time to appear in the original payment method.',
            'A clear issue summary, registered contact details, and payment proof help us process requests faster.',
        ],
    },
];

export default function RefundPolicyPage() {
    return (
        <PublicPageLayout
            badge="Refund and Cancellation"
            title="How billing cancellations and refund reviews are handled"
            description="This page explains how JLS Bill handles cancellation, refund eligibility, and the information required to review a billing dispute or service issue."
            canonicalPath={APP_INFO.refundPath}
            icon={RefreshCcw}
            actions={
                <>
                    <a href={`mailto:${APP_INFO.supportEmail}`} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Start refund request
                    </a>
                    <Link to={APP_INFO.supportPath} className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Talk to support first
                    </Link>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-3">
                {refundCards.map((card, index) => (
                    <section key={card.title} className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                        <div className="inline-flex rounded-2xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]">
                            {index === 0 ? <Info size={18} /> : index === 1 ? <CheckCircle2 size={18} /> : <Mail size={18} />}
                        </div>
                        <h2 className="mt-4 text-2xl font-black tracking-tight text-[var(--on-surface)]">{card.title}</h2>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--on-surface-variant)]">
                            {card.points.map((point) => (
                                <p key={point}>{point}</p>
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Refund request checklist</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm leading-7 text-[var(--on-surface-variant)]">
                        Use the registered email, mention the company name, payment date, amount, and the exact problem seen in the app.
                    </div>
                    <div className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm leading-7 text-[var(--on-surface-variant)]">
                        If the issue is technical, include screenshots or the affected workflow so support can try a recovery before refund action is finalized.
                    </div>
                </div>
            </section>
        </PublicPageLayout>
    );
}
