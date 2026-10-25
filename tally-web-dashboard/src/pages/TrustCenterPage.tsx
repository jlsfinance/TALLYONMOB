import { ArrowRight, FileText, LifeBuoy, Lock, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const trustCards = [
    {
        title: 'Privacy Policy',
        description: 'What data is processed, why it is used, and how deletion requests are handled.',
        icon: ShieldCheck,
        to: APP_INFO.privacyPath,
    },
    {
        title: 'Terms and Conditions',
        description: 'Usage rules, prohibited behavior, availability notes, and responsibility boundaries.',
        icon: FileText,
        to: APP_INFO.termsPath,
    },
    {
        title: 'Refund and Cancellation',
        description: 'How cancellations and refund reviews are handled for paid plans and disputes.',
        icon: RefreshCcw,
        to: APP_INFO.refundPath,
    },
    {
        title: 'Support Center',
        description: 'Fast contact channels, escalation details, and issue-reporting guidance.',
        icon: LifeBuoy,
        to: APP_INFO.supportPath,
    },
    {
        title: 'Security Center',
        description: 'Crash handling, abuse resistance, state validation, and responsible disclosure guidance.',
        icon: Lock,
        to: APP_INFO.securityPath,
    },
    {
        title: 'Account Deletion',
        description: 'Verified deletion flow, retained records, and how irreversible requests are protected.',
        icon: Trash2,
        to: APP_INFO.accountDeletionPath,
    },
];

export default function TrustCenterPage() {
    return (
        <PublicPageLayout
            badge="Trust Center"
            title="All public disclosure and compliance pages in one place"
            description="This hub brings together the pages that users, reviewers, and Play Store policy teams usually look for: privacy, terms, refund handling, support, security, and account deletion."
            canonicalPath={APP_INFO.trustCenterPath}
            icon={ShieldCheck}
            actions={
                <a href={APP_INFO.playStoreUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                    Open Play Store listing
                </a>
            }
        >
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {trustCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link key={card.to} to={card.to} className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]">
                            <div className="inline-flex rounded-2xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]">
                                <Icon size={18} />
                            </div>
                            <h2 className="mt-4 text-2xl font-black tracking-tight text-[var(--on-surface)]">{card.title}</h2>
                            <p className="mt-3 text-sm leading-7 text-[var(--on-surface-variant)]">{card.description}</p>
                            <div className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
                                Open page
                                <ArrowRight size={14} />
                            </div>
                        </Link>
                    );
                })}
            </div>
        </PublicPageLayout>
    );
}
