export type DashboardPeriod = 'today' | 'month' | '30days' | 'year';

export type StoredDashboardPeriod = {
  period: DashboardPeriod;
  fyYear: number;
};

const PERIOD_KEY = 'dashboard_period';
const FY_KEY = 'dashboard_fy_year';

export function getStoredDashboardPeriod(defaultPeriod: DashboardPeriod = 'year'): DashboardPeriod {
  if (typeof window === 'undefined') return defaultPeriod;
  const value = window.localStorage.getItem(PERIOD_KEY);
  return value === 'today' || value === 'month' || value === '30days' || value === 'year'
    ? value
    : defaultPeriod;
}

export function saveDashboardPeriod(period: DashboardPeriod): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(PERIOD_KEY, period);
}

export function getStoredFyYear(defaultFyYear: number): number {
  if (typeof window === 'undefined') return defaultFyYear;
  const value = Number(window.localStorage.getItem(FY_KEY));
  return Number.isInteger(value) && value >= 2000 && value <= 2100 ? value : defaultFyYear;
}

export function saveDashboardFyYear(fyYear: number): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(FY_KEY, String(fyYear));
}

export function readStoredDashboardPeriod(defaultFyYear: number): StoredDashboardPeriod {
  return {
    period: getStoredDashboardPeriod(),
    fyYear: getStoredFyYear(defaultFyYear),
  };
}
