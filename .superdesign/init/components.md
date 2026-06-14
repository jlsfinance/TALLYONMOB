# Components

Shared UI primitives and components.

## Neo-Glass UI Library
- Source: `src/components/ui/GlassUI.tsx`
- Description: Modern Glassmorphism/Material 3 inspired UI kit.

```tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// ==================== BUTTON ====================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'glow';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    loading?: boolean;
    icon?: React.ReactNode;
    iconRight?: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    className = '',
    disabled,
    fullWidth = false,
    ...props
}) => {
    const baseStyles = `
        inline-flex items-center justify-center gap-2 font-semibold 
        rounded-[var(--radius-full)] transition-all duration-300
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.97]
    `;

    const variants = {
        primary: 'bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-dark)] shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
        glow: 'bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-[var(--on-primary)] shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] hover:brightness-110 border border-white/10',
        secondary: 'bg-[var(--surface)] text-[var(--on-surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] shadow-[var(--shadow-sm)]',
        outline: 'border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--on-primary)]',
        ghost: 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] hover:text-[var(--on-surface)]',
        danger: 'bg-[var(--error)] text-white shadow-[var(--shadow-md)] hover:brightness-110',
    };

    const sizes = {
        sm: 'px-4 py-1.5 text-xs',
        md: 'px-5 py-2.5 text-sm',
        lg: 'px-8 py-3.5 text-base',
        xl: 'px-10 py-4 text-lg',
    };

    return (
        <button
            className={`
                ${baseStyles} 
                ${variants[variant]} 
                ${sizes[size]} 
                ${fullWidth ? 'w-full' : ''} 
                ${className}
            `}
            disabled={disabled || loading}
            ...props
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
            {children}
            {iconRight}
        </button>
    );
};

// ==================== CARD ====================
interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hover?: boolean;
    padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
    glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    hover = false,
    padding = 'md',
    glass = false,
}) => {
    const paddingStyles = {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
    };

    return (
        <div
            onClick={onClick}
            className={`
                relative
                ${glass
                    ? 'bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)]'
                    : 'bg-[var(--surface)] border border-[var(--border)]'
                }
                rounded-[var(--radius-xl)] 
                shadow-[var(--shadow-sm)]
                ${paddingStyles[padding]}
                ${hover ? 'hover:shadow-[var(--shadow-lg)] hover:-translate-y-1 transition-all duration-300' : ''}
                ${onClick ? 'cursor-pointer' : ''}
                ${className}
            `}
        >
            {children}
        </div>
    );
};

// ==================== STAT CARD ====================
interface StatCardProps {
    title: string;
    value: string;
    subtitle?: string;
    icon?: React.ReactNode;
    trend?: { value: string; up: boolean };
    color?: 'default' | 'success' | 'error' | 'warning' | 'primary' | 'info';
    onClick?: () => void;
    variant?: 'default' | 'solid';
}

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtitle,
    icon,
    trend,
    color = 'default',
    onClick,
    variant = 'default',
}) => {
    // ... (rest of implementation)
}
```
*Note: Full source code available in `src/components/ui/GlassUI.tsx`.*
