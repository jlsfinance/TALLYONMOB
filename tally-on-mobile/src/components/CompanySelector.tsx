'use client';

import { useEffect } from 'react';
import { useCompanyStore } from '@/stores/company-store';

export default function CompanySelector() {
  const { companies, activeCompany, isLoading, fetchCompanies, setActiveCompany } = useCompanyStore();

  useEffect(() => {
    if (companies.length === 0) fetchCompanies();
  }, [companies.length, fetchCompanies]);

  if (isLoading && companies.length === 0) {
    return <div className="h-10 w-48 bg-[var(--bg-secondary)] rounded-lg animate-pulse" />;
  }

  if (companies.length === 0) {
    return (
      <div className="text-sm text-[var(--text-secondary)] px-3 py-2 border border-[var(--border)] rounded-lg">
        No companies
      </div>
    );
  }

  return (
    <select
      value={activeCompany?.id || ''}
      onChange={(e) => {
        const company = companies.find((c) => c.id === e.target.value);
        if (company) setActiveCompany(company);
      }}
      className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-w-[200px]"
    >
      {companies.map((company) => (
        <option key={company.id} value={company.id}>
          {company.name}
          {company.gstin ? ` (${company.gstin})` : ''}
        </option>
      ))}
    </select>
  );
}
