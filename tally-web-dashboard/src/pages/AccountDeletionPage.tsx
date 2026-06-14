import { FileText, ShieldCheck, Trash2 } from 'lucide-react';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const deletionCards = [
    {
        title: 'How to request deletion',
        points: [
            'Send the request from the registered email or contact support using the verified phone number linked to the business account.',
            'Mention the company name, registered contact details, and whether you want only account closure or full data deletion review.',
            'We may ask for verification before acting so unauthorized users cannot delete another business workspace.',
        ],
    },
    {
        title: 'What gets removed',
        points: [
            'User access, app-level account records, and removable business data associated with the deletion request are scheduled for removal after verification.',
            'Connected sessions and access tokens are revoked as part of the closure flow.',
        ],
    },
    {
        title: 'What may be retained',
        points: [
            'Certain minimal records may be retained when required for tax, fraud, chargeback, bookkeeping, or legal compliance obligations.',
            'Where retention is required, the data is minimized and kept only for the mandatory purpose and period.',
        ],
    },
];

export default function AccountDeletionPage() {
    return (
        <PublicPageLayout
            badge="Account Deletion"
            title="How verified account and business data deletion works"
            description="This page explains how JLS Bill handles account closure, deletion requests, and the limited cases where records must still be retained for compliance or fraud review."
            canonicalPath={APP_INFO.accountDeletionPath}
            icon={Trash2}
            actions={
                <>
                    <a href={`mailto:${APP_INFO.supportEmail}?subject=JLS%20Bill%20Account%20Deletion%20Request`} className="inline-flex items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                        Email deletion request
                    </a>
                    <a href={`tel:${APP_INFO.supportPhone.replace(/\s+/g, '')}`} className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                        Call for verification
                    </a>
                </>
            }
        >
            <div className="grid gap-6 lg:grid-cols-3">
                {deletionCards.map((card, index) => (
                    <section key={card.title} className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[var(--shadow-sm)]">
                        <div className="inline-flex rounded-2xl bg-[var(--primary)]/10 p-3 text-[var(--primary)]">
                            {index === 0 ? <Trash2 size={18} /> : index === 1 ? <ShieldCheck size={18} /> : <FileText size={18} />}
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
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Deletion safety note</p>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--on-surface-variant)]">
                    A deletion page should never enable one-tap removal without verification. We intentionally validate ownership first because deletion is irreversible for most business records and can otherwise be abused by an attacker or competitor.
                </p>
            </section>
        </PublicPageLayout>
    );
}
