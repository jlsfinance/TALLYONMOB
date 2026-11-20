import { renderToStaticMarkup } from 'react-dom/server';
import { Link } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server.js';
import SyncoraLandingPage from '../src/pages/SyncoraLandingPage';
import SyncoraGuidePage from '../src/pages/SyncoraGuidePage';
import AboutUsPage from '../src/pages/AboutUsPage';
import SupportPage from '../src/pages/SupportPage';
import ContactUsPage from '../src/pages/ContactUsPage';
import PrivacyPolicyPage from '../src/pages/PrivacyPolicyPage';
import TermsPage from '../src/pages/TermsPage';
import RefundPolicyPage from '../src/pages/RefundPolicyPage';
import SecurityPage from '../src/pages/SecurityPage';
import TrustCenterPage from '../src/pages/TrustCenterPage';
import AccountDeletionPage from '../src/pages/AccountDeletionPage';
import PublicPricingIntro from '../src/components/common/PublicPricingIntro';

const pages = {
    '/': [SyncoraLandingPage, 'SyncoraLandingPage'],
    '/syncora': [SyncoraLandingPage, 'SyncoraLandingPage'],
    '/about': [AboutUsPage, 'AboutUsPage'],
    '/support': [SupportPage, 'SupportPage'],
    '/contact': [ContactUsPage, 'ContactUsPage'],
    '/privacy': [PrivacyPolicyPage, 'PrivacyPolicyPage'],
    '/terms': [TermsPage, 'TermsPage'],
    '/refund': [RefundPolicyPage, 'RefundPolicyPage'],
    '/security': [SecurityPage, 'SecurityPage'],
    '/trust-center': [TrustCenterPage, 'TrustCenterPage'],
    '/account-deletion': [AccountDeletionPage, 'AccountDeletionPage'],
    '/product-overview': [SyncoraGuidePage, 'SyncoraGuidePage'],
    '/guides/tally-sync-troubleshooting': [SyncoraGuidePage, 'SyncoraGuidePage'],
    '/guides/tallyprime-setup': [SyncoraGuidePage, 'SyncoraGuidePage'],
    '/guides/tally-ledger-on-mobile': [SyncoraGuidePage, 'SyncoraGuidePage'],
    '/for-accountants': [SyncoraGuidePage, 'SyncoraGuidePage'],
    '/pricing': [PricingPreview, 'SubscriptionPage'],
} as const;

function PricingPreview() {
    return (
        <main className="subscription-page">
            <div className="subscription-wrap">
                <header className="subscription-nav"><Link to="/">Syncora home</Link></header>
                <h1>Syncora pricing</h1>
                <PublicPricingIntro />
                <p><Link to="/login">Sign in to view your subscription</Link></p>
            </div>
        </main>
    );
}

export function renderSearchPage(path: string) {
    const [Page, file] = pages[path as keyof typeof pages];
    return {
        file: `src/pages/${file}.tsx`,
        markup: renderToStaticMarkup(<StaticRouter location={path}><Page /></StaticRouter>),
    };
}
