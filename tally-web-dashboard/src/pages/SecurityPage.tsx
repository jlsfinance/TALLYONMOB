import { Bug, KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const securityCards = [
    {
        title: 'Application hardening',
        icon: ShieldCheck,
        points: [
            'Route-level and render-level failures are wrapped in a recovery boundary so users see a fallback screen instead of a blank crash state.',
            'Public pages expose verified support, deletion, privacy, and refund workflows so abuse reports and recovery requests have a clear destination.',
        ],
    },
    {
        title: 'Access controls',
        icon: KeyRound,
        points: [
            'Session-dependent features require an active authenticated user and the app now sanitizes persisted mode values before trusting local state.',
            'Deletion or support actions are designed around verified ownership rather than unauthenticated destructive actions.',
        ],
    },
    {
        title: 'Crash and update handling',
        icon: RefreshCw,
        points: [
            'Unhandled runtime errors are logged, and the UI offers retry or reload actions so a bad state does not lock the whole app session.',
            'Critical issues may still require a patched release, but the app now degrades more gracefully during rendering failures.',
        ],
    },
    {
        title: 'Responsible disclosure',
        icon: Bug,
        points: [
            `Security concerns should be reported to ${APP_INFO.supportEmail} with steps, screenshots, and the affected company scope.`,
            'No client app can promise zero hack risk forever. The goal is to reduce attack surface, validate state, and fail safely instead of failing silently.',
        ],
    },
];

export default function SecurityPage() {
    return (
        <PublicPageLayout
            badge="Security Center"
            title="How JLS Bill reduces crash risk and raises the bar against abuse"
            description="This page describes the practical protections built into the app, what users should still do on their side, and how to report a security concern responsibly."
            canonicalPath={APP_INFO.securityPath}
            icon={Lock}
            actions={
                <>
                    <a href={`mailto:${APP_INFO.supportEmail}?subject=JLS%20Bill%20Security%20Report`} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Report a security issue
                    </a>
                    <a href={APP_INFO.playStoreUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        View Play Store listing
                    </a>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-2">
                {securityCards.map((card) => {
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

            <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">User-side safety checklist</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm leading-7 text-[var(--on-surface-variant)]">
                        Keep device OS and browser or app versions current, review unusual login prompts, and do not share OTPs or passwords with anyone.
                    </div>
                    <div className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm leading-7 text-[var(--on-surface-variant)]">
                        If you suspect tampering, stop using the affected workflow, capture the screen, and contact support before retrying destructive actions.
                    </div>
                </div>
            </section>
        </PublicPageLayout>
    );
}
