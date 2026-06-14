import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  yellow: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
};

export function StatCard({ label, value, sublabel, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-[var(--text-secondary)]">{label}</p>
          <p className="text-2xl font-bold text-[var(--text)] mt-1">{value}</p>
          {sublabel && (
            <p className="text-xs text-[var(--text-secondary)] mt-1">{sublabel}</p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', colorMap[color])}>{icon}</div>
      </div>
    </div>
  );
}
