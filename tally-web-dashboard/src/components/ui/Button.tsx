import React from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = {
  variant: {
    primary:
      'bg-[var(--gradient-primary)] text-white shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg),var(--glow-primary)] hover:-translate-y-0.5',
    secondary:
      'bg-[var(--glass-bg)] text-[var(--text-primary)] border border-[var(--glass-border)] backdrop-blur-[var(--blur-sm)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]',
    outline:
      'border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white',
    ghost:
      'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]',
    danger:
      'bg-gradient-to-r from-[var(--neon-red)] to-[var(--neon-orange)] text-white shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg),var(--glow-red)] hover:-translate-y-0.5',
    glow:
      'bg-[var(--gradient-primary)] text-white shadow-[var(--shadow-md),var(--glow-primary)] hover:shadow-[var(--shadow-lg),0_0_30px_rgba(127,84,248,0.6)] hover:-translate-y-0.5 hover:brightness-110',
  },
  size: {
    sm: 'px-3 py-1.5 text-xs rounded-[var(--radius-lg)]',
    md: 'px-5 py-2.5 text-sm rounded-[var(--radius-xl)]',
    lg: 'px-8 py-3.5 text-base rounded-[var(--radius-xl)]',
    xl: 'px-10 py-4 text-lg rounded-[var(--radius-2xl)]',
  },
} as const;

type ButtonVariant = keyof (typeof buttonVariants)['variant'];
type ButtonSize = keyof (typeof buttonVariants)['size'];

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          icon
        )}
        {children}
        {iconRight}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
