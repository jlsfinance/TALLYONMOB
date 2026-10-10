import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requirePattern = (file, pattern, message) => {
  if (!pattern.test(read(file))) failures.push(`${message} (${file})`);
};

requirePattern('src/components/common/AppErrorBoundary.tsx', /tabIndex=\{-1\}/, 'error recovery panel must be keyboard focusable');
requirePattern('src/components/common/AppErrorBoundary.tsx', /focus-visible:ring/, 'error recovery actions need visible focus styling');
requirePattern('src/components/OfflineIndicator.tsx', /role="status"/, 'offline state must be announced as status');
requirePattern('src/components/shared/FinancialPeriodSelector.tsx', /aria-label="Financial year"/, 'financial year selector needs an accessible label');
requirePattern('src/pages/BusinessInsightsPage.tsx', /aria-label="Refresh business insights"/, 'business insights refresh action needs an accessible label');
requirePattern('index.html', /lang="en"/, 'document language must be declared');
requirePattern('index.html', /meta name="description"/, 'document description metadata must be present');

const sourceFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') walk(full);
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));
const unlabeledIconOnlyButtons = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/<button\b([^>]*)>([\s\S]{0,240})<\/button>/g)) {
    const attrs = match[1];
    const body = match[2];
    const iconOnly = !/[A-Za-z]{3,}/.test(body.replace(/className|aria-label|title|size|color/g, ''));
    if (iconOnly && !/aria-label=|title=/.test(attrs)) unlabeledIconOnlyButtons.push(path.relative(root, file));
  }
}
const unique = [...new Set(unlabeledIconOnlyButtons)];
if (unique.length > 0) {
  console.warn(`Accessibility audit warning: ${unique.length} file(s) contain possible unlabeled icon-only buttons.`);
  unique.slice(0, 20).forEach((file) => console.warn(`- ${file}`));
}

if (failures.length) {
  console.error('Accessibility checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Accessibility checks passed (${sourceFiles.length} JSX/TSX files scanned).`);
