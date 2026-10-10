import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, passed: Boolean(condition), detail });
};

const dashboard = read('pages/DashboardPage.tsx');
const periodSelector = read('components/shared/FinancialPeriodSelector.tsx');
const parties = read('pages/LedgersPage.tsx');
const stock = read('pages/StockItemDetailPage.tsx');
const appLayout = read('components/layout/AppLayout.tsx');
const main = read('main.tsx');

check(
  'FY selector is mounted through the dashboard filter portal',
  dashboard.includes('<HeaderPortal type="filters">') && dashboard.includes('FinancialPeriodSelector'),
  'Dashboard must expose one header-owned financial period control.'
);
check(
  'FY selection persists and reloads',
  dashboard.includes("localStorage.setItem('dashboard_fy_year'") && dashboard.includes("localStorage.getItem('dashboard_fy_year')"),
  'The selected financial year must survive refresh.'
);
check(
  'FY selector is touch-safe',
  periodSelector.includes('touch-manipulation') && periodSelector.includes('pointer-events-auto'),
  'The native mobile control must remain tappable inside the sticky shell.'
);
check(
  'Parties voucher previews remain horizontally scrollable',
  parties.includes('overflow-x-auto') && parties.includes('touch-pan-x') && parties.includes('snap-x'),
  'Voucher previews must stay compact without wrapping into vertical gaps.'
);
check(
  'Parties voucher previews show type, date and amount',
  parties.includes('v.voucher_type') && parties.includes('v.voucher_date') && parties.includes('amt.toLocaleString'),
  'Preview cards must keep the existing real voucher fields visible.'
);
check(
  'Stock tabs expose explicit loading/error/empty paths',
  ['Summary', 'History', 'Customers', 'Suppliers'].every((label) => stock.includes(label)) &&
    stock.includes('historyLoading') && stock.includes('No transactions found'),
  'SKU tabs must not regress to a blank state.'
);
check(
  'Mobile navigation and shell are present',
  appLayout.includes('md:hidden sticky top-0') && appLayout.includes("label: 'Parties'") && appLayout.includes('header-filters-mobile'),
  'The mobile header, Parties navigation and filter mount point must remain available.'
);
check(
  'Chunk recovery has a reload-loop guard',
  main.includes('sessionStorage') && main.includes('tally_chunk_recovery_attempted'),
  'A stale lazy chunk may reload once but must not create an infinite loop.'
);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.passed) console.log(`  ${item.detail}`);
}

if (failures.length) {
  console.error(`\nMobile dashboard checks failed: ${failures.length}`);
  process.exit(1);
}

console.log(`\nMobile dashboard checks passed: ${checks.length}`);
