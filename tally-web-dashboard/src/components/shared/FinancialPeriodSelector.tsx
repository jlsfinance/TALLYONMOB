import React, { useMemo } from 'react';

export type FinancialYearOption = {
  value: string;
  label: string;
};

type PeriodMonth = {
  key: string;
  label: string;
  fullLabel?: string;
};

type FinancialPeriodSelectorProps = {
  selectedFy: string;
  onFyChange: (fy: string) => void;
  selectedMonth?: string | null;
  onMonthChange?: (month: string) => void;
  monthsInFy?: PeriodMonth[];
  className?: string;
};

function currentStartYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function parseStartYear(value: string): number {
  const match = String(value || '').match(/(20\d{2})/);
  const year = match ? Number(match[1]) : currentStartYear();
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : currentStartYear();
}

export function makeFinancialYears(count = 5): FinancialYearOption[] {
  const start = currentStartYear();
  return Array.from({ length: count }, (_, index) => {
    const year = start - index;
    return { value: `FY ${year}-${String(year + 1).slice(-2)}`, label: `FY ${year}-${String(year + 1).slice(-2)}` };
  });
}

export default function FinancialPeriodSelector({
  selectedFy,
  onFyChange,
  selectedMonth,
  onMonthChange,
  monthsInFy = [],
  className = '',
}: FinancialPeriodSelectorProps) {
  const years = useMemo(() => makeFinancialYears(5), []);
  const selectedValue = years.some((item) => item.value === selectedFy)
    ? selectedFy
    : `FY ${parseStartYear(selectedFy)}-${String(parseStartYear(selectedFy) + 1).slice(-2)}`;

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (next) {
      onFyChange(next);
      if (onMonthChange) onMonthChange('all');
    }
  };

  return (
    <div className={`relative z-[80] flex flex-wrap items-center gap-2 isolate pointer-events-auto ${className}`} data-financial-period-selector>
      <label className="relative z-[81] flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm pointer-events-auto">
        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Financial Year</span>
        <select
          aria-label="Financial year"
          value={selectedValue}
          onChange={handleYearChange}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="relative z-[82] min-w-[118px] cursor-pointer touch-manipulation bg-transparent text-[11px] font-black text-[var(--on-surface)] outline-none pointer-events-auto"
        >
          {years.map((year) => <option key={year.value} value={year.value}>{year.label}</option>)}
        </select>
      </label>

      {onMonthChange && monthsInFy.length > 0 && (
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Month</span>
          <select
            aria-label="Financial year month"
            value={selectedMonth || 'all'}
            onChange={(event) => onMonthChange(event.target.value)}
            className="min-w-[92px] cursor-pointer bg-transparent text-[11px] font-black text-[var(--on-surface)] outline-none"
          >
            {monthsInFy.map((month) => <option key={month.key} value={month.key}>{month.key === 'all' ? 'ALL' : month.fullLabel || month.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
