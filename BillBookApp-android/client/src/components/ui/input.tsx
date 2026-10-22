import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Show error state styling */
  error?: boolean | string;
  /** Show success state styling */
  success?: boolean;
  /** Label for floating label mode */
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, success, label, id, placeholder, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const inputClasses = cn(
      // Base styles
      "flex h-11 w-full rounded-xl border bg-white/5 px-4 py-2.5 text-sm text-foreground",
      "transition-all duration-200",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
      "placeholder:text-muted-foreground/60",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Border color based on state
      !error && !success && "border-border focus-visible:ring-ring/50 focus-visible:border-primary/50",
      error && "border-destructive/70 focus-visible:ring-destructive/50 focus-visible:border-destructive",
      success && "border-emerald-500/50 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500",
      // Floating label padding when label exists
      label && "pt-5 pb-2",
      className
    );

    if (label) {
      return (
        <div className="relative">
          <input
            id={inputId}
            type={type}
            placeholder={placeholder || " "}
            className={inputClasses}
            ref={ref}
            {...props}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "absolute left-4 transition-all duration-200 pointer-events-none",
              "text-xs text-muted-foreground/80 top-1.5",
              error && "text-destructive/80",
              success && "text-emerald-400/80",
              "peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted-foreground/60",
              "peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary/80"
            )}
          >
            {label}
          </label>
          {/* Error message */}
          {error && typeof error === 'string' && (
            <p className="mt-1.5 text-xs text-destructive/80 px-1 animate-slide-up">
              {error}
            </p>
          )}
          {/* Success indicator */}
          {success && !error && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    return (
      <div>
        <input
          id={inputId}
          type={type}
          placeholder={placeholder}
          className={inputClasses}
          ref={ref}
          {...props}
        />
        {/* Error message when no label */}
        {error && typeof error === 'string' && (
          <p className="mt-1.5 text-xs text-destructive/80 px-1 animate-slide-up">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input"

export { Input }
