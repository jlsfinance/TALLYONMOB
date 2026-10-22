import React, { useId } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, wrapperClassName, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const inputId = externalId || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className={cn('space-y-2', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-[var(--text-secondary)] ml-1"
          >
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--neon-blue)] transition-colors duration-200 z-10">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={errorId}
            className={cn(
              'w-full px-5 py-3',
              'bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-[var(--blur-sm)]',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'rounded-[var(--radius-xl)]',
              'focus:outline-none focus:border-[var(--neon-blue)] focus:shadow-[0_0_0_3px_rgba(0,212,255,0.15)]',
              'transition-all duration-200',
              icon && 'pl-11',
              error &&
                'border-[var(--neon-red)] focus:border-[var(--neon-red)] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]',
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs font-medium text-[var(--neon-red)] ml-1"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export { Input };
