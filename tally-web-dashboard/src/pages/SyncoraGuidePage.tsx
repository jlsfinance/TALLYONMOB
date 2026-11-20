import { BookOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import PublicPageLayout from '../components/common/PublicPageLayout';
import { APP_INFO } from '../config/appInfo';

const guides = {
  '/product-overview': {
    title: 'What is Syncora?',
    description: 'Syncora connects a TallyPrime company to a dashboard for Android and the web. It is built for business owners and accountants who need to review Tally data away from the accounting PC.',
    sections: [
      ['Where does my data come from?', 'Syncora Connector runs on the Windows PC that can reach TallyPrime. The connector syncs the selected company to your Syncora account. Sign in on Android or in a web browser and open that company.'],
      ['What can I check on my phone?', 'Open Day Book for vouchers by date, Parties for customer or supplier ledgers and balances, and Stock for item information. You can choose a date range and export a party ledger as a PDF.'],
      ['Do I need TallyPrime on my phone?', 'The phone uses synced data through Syncora. TallyPrime and the Windows connector are needed on the accounting side to send new changes. Check the last successful sync to see how recent the dashboard data is.'],
      ['How do I try Syncora?', 'New accounts can start with a 90-day trial. See the pricing page for current plans, follow the TallyPrime setup guide for the first sync, or contact Syncora for a demo.'],
    ],
  },
  '/guides/tally-sync-troubleshooting': {
    title: 'Troubleshoot TallyPrime Sync in Syncora',
    description: 'Check why a company is missing, a new voucher is absent or the Syncora dashboard still shows older figures.',
    sections: [
      ['Check the company and date', 'Compare the company selected in TallyPrime with the company open in Syncora. Check the date range and financial year. In the Day Book, look for the exact voucher type and number.'],
      ['Check the last connector run', 'On the Windows PC, open the company in TallyPrime and check the most recent result in Syncora Connector. If a run is in progress, wait for it to finish. If it failed, note the error and the time of the attempt.'],
      ['Compare a voucher after a successful sync', 'Open the same company in Syncora and compare the voucher date, number and amount with TallyPrime. This helps distinguish a date filter issue from a missing or stale record.'],
      ['Share the details with support', 'Include the connector version, the company name, the last successful sync time and the error text. For a missing voucher, include its type and number. Leave passwords, access tokens and unrelated customer details out of screenshots.'],
    ],
  },
  '/guides/tallyprime-setup': {
    title: 'Connect TallyPrime to Syncora',
    description: 'Set up the Windows connector on the computer running TallyPrime, then open the synced company on your phone or in a browser.',
    sections: [
      ['1. Open the company in TallyPrime', 'Use the Windows PC that runs TallyPrime. Open the company you want to sync and check that the local Tally connection is enabled. Keep Tally open while the connector reads the company.'],
      ['2. Sign in to the Windows connector', 'Download and install Syncora Connector. Sign in with the same Syncora account you use in the mobile app or web dashboard. Run Sync Now and check whether the company sync completed.'],
      ['3. Choose the synced company', 'Sign in on your phone or browser. Select the company and open the Day Book or Vouchers to check a recent entry against TallyPrime.'],
      ['If the company does not appear', 'Check the open company in Tally, the account used in the connector and the most recent sync status. If the sync failed, capture the error shown by the connector before contacting support.'],
    ],
  },
  '/guides/tally-ledger-on-mobile': {
    title: 'How to View Tally Party Ledgers on Mobile',
    description: 'Find customer and supplier transactions from a synced Tally company using Syncora on mobile or web.',
    sections: [
      ['Find the party', 'Sign in, select your synced company, and open Parties or Ledgers. Search by the customer or supplier name as it appears in Tally.'],
      ['Choose the reporting period', 'Select the financial year or date range and review the debit and credit entries. Check the latest sync before relying on the figures for a payment or follow-up.'],
      ['Download a ledger statement', 'Use the ledger PDF export and choose the dates you want. Compare any unverified or unexpected opening and closing balance with the original ledger in Tally before sharing it.'],
      ['Check a particular entry', 'Look up the voucher date, type and number in both Syncora and Tally. If an entry was just edited in Tally, check the next connector sync before comparing it again.'],
    ],
  },
  '/for-accountants': {
    title: 'Syncora for Chartered Accountants and Accounting Teams',
    description: 'Review synced Tally vouchers, party balances, day book entries and reports on mobile and web.',
    sections: [
      ['Review a client’s company', 'Set up the Windows connector on the client’s Tally computer with their permission. Select the connected company and financial year before reviewing vouchers or ledgers.'],
      ['Use the latest sync for review', 'Check the last successful sync, then use voucher numbers and dates to compare entries with Tally. For month-end review, resolve differences against the original books before sharing statements.'],
      ['Try Syncora with a client', 'New accounts can start with a 90-day trial. Contact Syncora for a short demo of company setup, ledger review and the Windows connector.'],
    ],
  },
};

export default function SyncoraGuidePage() {
  const path = useLocation().pathname.replace(/\/+$/, '');
  const guide = guides[path as keyof typeof guides];
  if (!guide) return null;

  return (
    <PublicPageLayout badge="Syncora guides" title={guide.title} description={guide.description}
      canonicalPath={path} icon={BookOpen}>
      <div className="mx-auto max-w-3xl space-y-6">
        {guide.sections.map(([title, text]) => (
          <section key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--on-surface-variant)]">{text}</p>
          </section>
        ))}
        <nav className="flex flex-wrap gap-4 text-sm font-semibold text-[var(--primary)]" aria-label="Related Syncora resources">
          {path === '/guides/tallyprime-setup' && <a href={APP_INFO.pcDownloadUrl}>Download the Windows connector</a>}
          {Object.entries(guides).filter(([url]) => url !== path).map(([url, page]) => <Link key={url} to={url}>{page.title}</Link>)}
          <Link to="/pricing">Plans and trial</Link>
          <Link to="/contact">Request a demo or contact support</Link>
        </nav>
      </div>
    </PublicPageLayout>
  );
}
