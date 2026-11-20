export const siteOrigin = 'https://tallyonmob.vercel.app';
export const socialImage = siteOrigin + '/syncora-social.png';
export const searchPages = {
  '/': ['Tally on Mobile & Web | Syncora', 'Connect TallyPrime to Syncora with the Windows connector. View vouchers, party ledgers, outstanding balances, stock and reports on your phone or browser.'],
  '/product-overview': ['What Is Syncora? | TallyPrime on Android & Web', 'See what Syncora connects, where the Windows connector runs, and how to review synced TallyPrime vouchers, ledgers and stock on Android or web.'],
  '/guides/tally-sync-troubleshooting': ['Troubleshoot TallyPrime Sync | Syncora Guide', 'Diagnose missing companies, stale dashboard figures and missing vouchers by checking the selected company, date range and latest connector run.'],
  '/pricing': ['Syncora Pricing & 90-Day Trial | Tally on Mobile', 'Compare Syncora monthly, six-month and yearly plans. New accounts receive a 90-day trial. View current prices and plan details.'],
  '/guides/tallyprime-setup': ['How to Connect TallyPrime to Syncora | Windows Setup', 'Install the Syncora Windows connector, select a TallyPrime company and check that its data is available on your phone or browser.'],
  '/guides/tally-ledger-on-mobile': ['View Tally Party Ledgers on Mobile | Syncora Guide', 'Find a customer or supplier ledger, choose a date range, check debit and credit entries, and download a ledger PDF in Syncora.'],
  '/for-accountants': ['Syncora for CAs & Accountants | Tally on Mobile', 'Use Syncora to review synced Tally vouchers, party balances and reports with your clients. Find setup steps and ask for a demo.'],
  '/about': ['About Syncora | Tally on Mobile & Web', 'Learn how the Syncora Windows connector makes selected Tally company data available to your team on mobile and web.'],
  '/support': ['Syncora Support | Tally Connector & Account Help', 'Get help connecting TallyPrime, troubleshooting sync and resolving account or billing issues in Syncora.'],
  '/contact': ['Contact Syncora | Product Demo & Support', 'Contact Syncora for a demo, help with the Windows connector, or questions about your account.'],
  '/privacy': ['Syncora Privacy Policy', 'Learn how Syncora handles account, Tally and business data, and how to request account deletion.'],
  '/terms': ['Syncora Terms of Service', 'Read the terms for using the Syncora website, mobile app and Windows connector.'],
  '/refund': ['Syncora Refund & Cancellation Policy', 'Read how Syncora handles subscription cancellations, refund requests and billing disputes.'],
  '/security': ['Syncora Security & Responsible Disclosure', 'Read about Syncora account protections and how to report a security concern.'],
  '/trust-center': ['Syncora Trust Center', 'Find Syncora policies for privacy, security, billing, support and account deletion.'],
  '/account-deletion': ['Delete Your Syncora Account', 'Learn how to request deletion of your Syncora account and associated data.'],
};

export function getSearchPage(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const canonicalPath = path === '/syncora' ? '/' : path;
  if (!Object.hasOwn(searchPages, canonicalPath)) return null;
  const [title, description] = searchPages[canonicalPath];
  return { title, description, canonical: new URL(canonicalPath, siteOrigin).href };
}

export const productSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': siteOrigin + '/#organization', name: 'Syncora',
      url: siteOrigin + '/', logo: siteOrigin + '/syncora-mark.svg' },
    { '@type': 'WebSite', '@id': siteOrigin + '/#website', name: 'Syncora', url: siteOrigin + '/',
      publisher: { '@id': siteOrigin + '/#organization' } },
    { '@type': 'SoftwareApplication', '@id': siteOrigin + '/#app', name: 'Syncora',
      url: siteOrigin + '/', applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android, Windows', description: searchPages['/'][1],
      publisher: { '@id': siteOrigin + '/#organization' } },
  ],
};
