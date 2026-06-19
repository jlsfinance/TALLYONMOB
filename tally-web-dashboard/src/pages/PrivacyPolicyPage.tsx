import { Database, Eye, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const privacyCards = [
    {
        title: 'What we collect',
        icon: Database,
        points: [
            'Account details such as business name, contact email, and phone number used for login, support, and billing communication.',
            'Operational business data such as invoices, ledgers, stock details, tax fields, and synced company metadata needed to run billing workflows.',
            'Device and session signals required for security review, crash diagnosis, and abuse prevention.',
        ],
    },
    {
        title: 'How the data is used',
        icon: Eye,
        points: [
            'To authenticate users, open the correct company workspace, and generate billing outputs like GST invoices, ledgers, and reports.',
            'To protect accounts against misuse, investigate suspicious behavior, and improve stability of sync and billing features.',
            'To provide customer support, handle refund and deletion requests, and meet legal bookkeeping obligations.',
        ],
    },
    {
        title: 'Security and retention',
        icon: Lock,
        points: [
            'Transport is encrypted in transit and access is restricted to authorized application flows and support operations.',
            'We keep data only as long as needed for service delivery, recovery, compliance, and dispute resolution.',
            'Residual records may be retained where required by tax, accounting, fraud-review, or legal obligations.',
        ],
    },
    {
        title: 'Deletion controls',
        icon: Trash2,
        points: [
            'Users can request account deletion and data removal through the account deletion page or support email.',
            'Deletion requests are verified before action so one user cannot remove another company workspace without authorization.',
            'Where complete deletion is not legally possible, data is minimized and retained only for the mandatory purpose.',
        ],
    },
];

export default function PrivacyPolicyPage() {
    return (
        <PublicPageLayout
            badge="Privacy Policy"
            title="How SYNCORA TallyOnMobile handles business and user data"
            description="This page explains what data SYNCORA TallyOnMobile processes, why it is needed, how it is protected, and how users can request deletion or support."
            canonicalPath={APP_INFO.privacyPath}
            icon={ShieldCheck}
            actions={
                <>
                    <Link to={APP_INFO.accountDeletionPath} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Account deletion steps
                    </Link>
                    <Link to={APP_INFO.trustCenterPath} className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Open trust center
                    </Link>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-2">
                {privacyCards.map((card) => {
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
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Privacy contact</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--on-surface)]">Need a privacy or deletion response?</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--on-surface-variant)]">
                    Send your request from the registered email or include enough business details for verification. This helps us avoid unauthorized deletion or disclosure.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <a href={`mailto:${APP_INFO.supportEmail}`} className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm font-semibold text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Email: {APP_INFO.supportEmail}
                    </a>
                    <a href={`tel:${APP_INFO.supportPhone.replace(/\s+/g, '')}`} className="rounded-[24px] border border-[var(--border)] px-5 py-4 text-sm font-semibold text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Phone: {APP_INFO.supportPhone}
                    </a>
                </div>
            </section>
        </PublicPageLayout>
    );
}
