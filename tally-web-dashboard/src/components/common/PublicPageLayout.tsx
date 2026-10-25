import type { ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Package, ShieldCheck, type LucideIcon } from 'lucide-react';
import SEO from './SEO';
import SafeLink from './SafeLink';
import { APP_INFO, getPublicUrl } from '../../config/appInfo';

interface PublicPageLayoutProps {
    badge: string;
    title: string;
    description: string;
    canonicalPath: string;
    icon: LucideIcon;
    children: ReactNode;
    actions?: ReactNode;
}

const quickLinks = [
    { label: 'Trust Center', to: APP_INFO.trustCenterPath },
    { label: 'Privacy', to: APP_INFO.privacyPath },
    { label: 'Terms', to: APP_INFO.termsPath },
    { label: 'Support', to: APP_INFO.supportPath },
];

export default function PublicPageLayout({
    badge,
    title,
    description,
    canonicalPath,
    icon: Icon,
    children,
    actions,
}: PublicPageLayoutProps) {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_28%),var(--background)] text-[var(--on-background)]">
            <SEO
                title={`${title} | ${APP_INFO.name}`}
                description={description}
                canonical={getPublicUrl(canonicalPath)}
            />

            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-col gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 p-4 shadow-[var(--shadow-sm)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <SafeLink to="/" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                            <ArrowLeft size={16} />
                            Back to app
                        </SafeLink>
                        <div className="inline-flex items-center gap-3 rounded-full bg-[var(--primary)]/10 px-4 py-2 text-sm font-black text-[var(--primary)]">
                            <ShieldCheck size={16} />
                            {APP_INFO.name}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {quickLinks.map((link) => (
                            <SafeLink key={link.to} to={link.to} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--on-surface)]">
                                {link.label}
                            </SafeLink>
                        ))}
                        <a
                            href={APP_INFO.playStoreUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--on-surface)]"
                        >
                            Play Store
                            <ExternalLink size={14} />
                        </a>
                    </div>
                </header>

                <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_0.55fr]">
                    <section className="rounded-[32px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(255,255,255,0.85))] p-6 shadow-[var(--shadow-lg)] dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(15,23,42,0.92))] sm:p-8">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)]/80 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)] shadow-[var(--shadow-xs)]">
                            <Icon size={16} />
                            {badge}
                        </div>
                        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.04em] text-[var(--on-surface)] sm:text-5xl">
                            {title}
                        </h1>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--on-surface-variant)] sm:text-base">
                            {description}
                        </p>
                        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
                    </section>

                    <aside className="space-y-4">
                        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[var(--shadow-sm)]">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">Need help fast?</p>
                            <div className="mt-4 space-y-3 text-sm text-[var(--on-surface)]">
                                <a href={`mailto:${APP_INFO.supportEmail}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                                    <span className="truncate">{APP_INFO.supportEmail}</span>
                                    <ExternalLink size={14} className="text-[var(--text-muted)]" />
                                </a>
                                <a href={`tel:${APP_INFO.supportPhone.replace(/\s+/g, '')}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-hover)]">
                                    <span>{APP_INFO.supportPhone}</span>
                                    <ExternalLink size={14} className="text-[var(--text-muted)]" />
                                </a>
                                <p className="rounded-2xl border border-[var(--border)] bg-[var(--background)]/80 px-4 py-3 text-xs leading-6 text-[var(--on-surface-variant)]">
                                    Response window: {APP_INFO.supportHours}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[var(--shadow-sm)]">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--primary)]">App identity</p>
                            <div className="mt-4 space-y-3 text-sm text-[var(--on-surface-variant)]">
                                <div className="rounded-2xl border border-[var(--border)] px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Package</p>
                                    <p className="mt-2 font-semibold text-[var(--on-surface)]">{APP_INFO.packageName}</p>
                                </div>
                                <div className="rounded-2xl border border-[var(--border)] px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Policy refreshed</p>
                                    <p className="mt-2 font-semibold text-[var(--on-surface)]">{APP_INFO.lastUpdated}</p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--info-bg)] px-4 py-2 text-xs font-bold text-[var(--info)]">
                                    <Package size={14} />
                                    Play Store aligned disclosure pages
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                <main className="mt-8 space-y-6">{children}</main>

                <footer className="mt-10 rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 px-6 py-5 text-sm text-[var(--on-surface-variant)] shadow-[var(--shadow-sm)]">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <p>
                            {APP_INFO.name} trust pages cover privacy, refunds, support, security posture, and account deletion handling.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {quickLinks.map((link) => (
                                <SafeLink key={`${link.to}-footer`} to={link.to} className="rounded-full bg-[var(--surface-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-variant)]">
                                    {link.label}
                                </SafeLink>
                            ))}
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
