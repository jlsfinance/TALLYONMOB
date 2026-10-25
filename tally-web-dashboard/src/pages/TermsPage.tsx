import { AlertTriangle, CheckCircle2, FileText, Scale, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const termsCards = [
    {
        title: 'Service scope',
        icon: FileText,
        points: [
            'SYNCORA TallyOnMobile provides billing, GST invoicing, ledgers, stock workflows, and related support features delivered through our app and connected services.',
            'Use of the app requires truthful account details and lawful business activity. You remain responsible for the content and correctness of entries you create.',
        ],
    },
    {
        title: 'Allowed and prohibited use',
        icon: CheckCircle2,
        points: [
            'You may use the app for your own business operations, internal teams, or authorized company workflows.',
            'You may not reverse engineer the service, abuse login flows, scrape other users data, distribute malware, or attempt to bypass access controls.',
        ],
    },
    {
        title: 'Availability and limits',
        icon: ShieldCheck,
        points: [
            'We work to keep the service stable, but uptime can still be affected by network failures, platform incidents, maintenance, or third-party outages.',
            'We can suspend abusive sessions, rate-limit suspicious activity, and require updates when necessary to keep the product secure.',
        ],
    },
    {
        title: 'Liability and law',
        icon: Scale,
        points: [
            'The app is provided as a software service. Users should review outputs before using them for tax or business decisions.',
            'To the maximum extent allowed by law, liability is limited to the fees paid for the affected service period, and disputes are governed by applicable Indian law.',
        ],
    },
];

export default function TermsPage() {
    return (
        <PublicPageLayout
            badge="Terms and Conditions"
            title="Rules for using SYNCORA TallyOnMobile responsibly"
            description="These terms define how SYNCORA TallyOnMobile can be used, what behavior is prohibited, how we handle availability, and how support or disputes are managed."
            canonicalPath={APP_INFO.termsPath}
            icon={FileText}
            actions={
                <>
                    <Link to={APP_INFO.supportPath} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Contact support
                    </Link>
                    <Link to={APP_INFO.refundPath} className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Refund terms
                    </Link>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-2">
                {termsCards.map((card) => {
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

            <section className="rounded-[28px] border border-[var(--warning)]/20 bg-[var(--warning-bg)]/80 p-6 shadow-[var(--shadow-sm)]">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-1 text-[var(--warning)]" />
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-[var(--on-surface)]">Important user responsibility</h2>
                        <p className="mt-3 text-sm leading-7 text-[var(--on-surface-variant)]">
                            App security is shared. Keep your device updated, do not share OTPs or login credentials, and review sensitive billing data before finalizing business actions.
                        </p>
                    </div>
                </div>
            </section>
        </PublicPageLayout>
    );
}
