import React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = {
  variant: {
    default:
      'bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)]',
    primary:
      'bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/25',
    success:
      'bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]/25',
    error:
      'bg-[var(--status-error-bg)] text-[var(--status-error)] border border-[var(--status-error)]/25',
    warning:
      'bg-[var(--status-warning-bg)] text-[var(--status-warning)] border border-[var(--status-warning)]/25',
    info:
      'bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/25',
    outline:
      'border border-[var(--glass-border-hover)] text-[var(--text-secondary)] bg-transparent',
    neon:
      'bg-[var(--glass-bg-colored)] text-[var(--primary-light)] border border-[var(--glass-border-glow)] shadow-[0_0_10px_rgba(127,84,248,0.2)]',
  },
  size: {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  },
} as const;

type BadgeVariant = keyof (typeof badgeVariants)['variant'];
type BadgeSize = keyof (typeof badgeVariants)['size'];

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-bold rounded-full transition-colors',
          badgeVariants.variant[variant],
          badgeVariants.size[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
