import { Clock, LifeBuoy, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const supportCards = [
    {
        title: 'Best contact channels',
        icon: LifeBuoy,
        points: [
            `Primary email support: ${APP_INFO.supportEmail}`,
            `Direct phone support: ${APP_INFO.supportPhone}`,
            'Use the registered business account details when contacting support so the team can verify ownership quickly.',
        ],
    },
    {
        title: 'Response expectations',
        icon: Clock,
        points: [
            `Standard support window: ${APP_INFO.supportHours}`,
            'Critical access or billing failures should clearly mention urgency, the affected company, and whether invoicing is blocked right now.',
            'Complex technical cases may require logs, screenshots, or a callback for step-by-step verification.',
        ],
    },
    {
        title: 'What to include',
        icon: MessageCircle,
        points: [
            'Registered email or phone number',
            'Company name and affected feature such as invoice creation, stock, sync, login, or payments',
            'A screenshot, error text, or exact action that caused the issue so the team can reproduce it without guessing',
        ],
    },
];

export default function SupportPage() {
    return (
        <PublicPageLayout
            badge="Support Center"
            title="Contact, escalation, and issue-reporting guidance"
            description="Use this page when you need product support, refund help, a security response, or account deletion assistance for JLS Bill."
            canonicalPath={APP_INFO.supportPath}
            icon={LifeBuoy}
            actions={
                <>
                    <a href={`mailto:${APP_INFO.supportEmail}`} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Email support
                    </a>
                    <a href={`tel:${APP_INFO.supportPhone.replace(/\s+/g, '')}`} className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Call support
                    </a>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-3">
                {supportCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <section key={card.title} className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                            <div className="inline-flex rounded-2xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]">
                                <Icon size={18} />
                            </div>
                            <h2 className="mt-4 text-2xl font-black tracking-tight text-[var(--on-surface)]">{card.title}</h2>
                            <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--on-surface-variant)]">
                                {card.points.map((point) => (
                                    <p key={point}>{point}</p>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Direct channels</p>
                    <div className="mt-4 space-y-3 text-sm text-[var(--on-surface)]">
                        <a href={`mailto:${APP_INFO.supportEmail}`} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                            <Mail size={16} className="text-[var(--primary)]" />
                            {APP_INFO.supportEmail}
                        </a>
                        <a href={`tel:${APP_INFO.supportPhone.replace(/\s+/g, '')}`} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                            <Phone size={16} className="text-[var(--primary)]" />
                            {APP_INFO.supportPhone}
                        </a>
                    </div>
                </div>

                <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Escalation guidance</p>
                    <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--on-surface-variant)]">
                        <p>Security concerns should mention suspicious login behavior, unexpected data exposure, or repeatable crash steps.</p>
                        <p>Refund matters should include payment date, amount, and whether the service issue has already been reviewed by support.</p>
                        <p>Deletion requests should come from the registered contact and include company verification details so the request cannot be abused.</p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--info-bg)] px-4 py-2 text-xs font-bold text-[var(--info)]">
                        <ShieldCheck size={14} />
                        Verified requests are processed faster and more safely.
                    </div>
                </div>
            </section>
        </PublicPageLayout>
    );
}
