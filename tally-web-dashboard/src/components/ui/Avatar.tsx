import React from 'react';
import { cn } from '../../lib/utils';

const avatarSizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
} as const;

const avatarColors = [
  'bg-[var(--primary)]/20 text-[var(--primary)]',
  'bg-[var(--status-success-bg)] text-[var(--status-success)]',
  'bg-[var(--status-error-bg)] text-[var(--status-error)]',
  'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
  'bg-[var(--status-info-bg)] text-[var(--status-info)]',
  'bg-[var(--glass-bg)] text-[var(--text-primary)]',
] as const;

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Name to derive initials and color from */
  name: string;
  /** Image URL for photo avatars */
  src?: string;
  /** Fallback alt text for image */
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional explicit color index (0-5) */
  colorIndex?: number;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function hashColor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarColors.length;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      name,
      src,
      alt,
      size = 'md',
      colorIndex,
      ...props
    },
    ref,
  ) => {
    const colorClass =
      avatarColors[colorIndex ?? hashColor(name)];

    if (src) {
      return (
        <div
          ref={ref}
          className={cn(
            'relative inline-flex items-center justify-center overflow-hidden',
            'rounded-[var(--radius-xl)] ring-2 ring-[var(--glass-border)]',
            avatarSizes[size],
            className,
          )}
          {...props}
        >
          <img
            src={src}
            alt={alt ?? name}
            className="h-full w-full object-cover"
          />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center',
          'rounded-[var(--radius-xl)] ring-2 ring-[var(--glass-border)]',
          'font-bold select-none',
          avatarSizes[size],
          colorClass,
          className,
        )}
        {...props}
      >
        {getInitials(name)}
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar };
