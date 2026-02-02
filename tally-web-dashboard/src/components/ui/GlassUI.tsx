import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { Loader2 } from 'lucide-react';

// =====================================================
// MATERIAL 3 COMPONENT LIBRARY - FRESH BUILD
// =====================================================

// ==================== BUTTON ====================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: React.ReactNode;
    iconRight?: React.ReactNode;
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
    ...props
}) => {
    const baseStyles = `
        inline-flex items-center justify-center gap-2 font-medium 
        rounded-[var(--radius-md)] transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
    `;

    const variants = {
        primary: 'bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90 shadow-sm',
        secondary: 'bg-[var(--surface-variant)] text-[var(--on-surface)] hover:bg-[var(--border)]',
        outline: 'border border-[var(--border)] text-[var(--on-surface)] hover:bg-[var(--surface-variant)]',
        ghost: 'text-[var(--on-surface)] hover:bg-[var(--surface-variant)]',
        danger: 'bg-[var(--error)] text-white hover:opacity-90',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || loading}
            {...props}
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
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    hover = false,
    padding = 'md',
}) => {
    const paddingStyles = {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
    };

    return (
        <div
            onClick={onClick}
            className={`
                bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)]
                ${paddingStyles[padding]}
                ${hover ? 'hover:border-[var(--primary)] hover:shadow-md cursor-pointer transition-all duration-200' : ''}
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
    color?: 'default' | 'success' | 'error' | 'warning' | 'primary';
    onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtitle,
    icon,
    trend,
    color = 'default',
    onClick,
}) => {
    const colorStyles = {
        default: { icon: 'bg-[var(--surface-variant)] text-[var(--on-surface)]', value: '' },
        success: { icon: 'bg-[var(--success-bg)] text-[var(--success)]', value: 'text-[var(--success)]' },
        error: { icon: 'bg-[var(--error-bg)] text-[var(--error)]', value: 'text-[var(--error)]' },
        warning: { icon: 'bg-[var(--warning-bg)] text-[var(--warning)]', value: 'text-[var(--warning)]' },
        primary: { icon: 'bg-[var(--primary)]/10 text-[var(--primary)]', value: 'text-[var(--primary)]' },
    };

    return (
        <motion.div
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`
                bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)] p-5
                ${onClick ? 'cursor-pointer hover:border-[var(--primary)] hover:shadow-md' : ''}
                transition-all duration-200
            `}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--on-surface-variant)] font-medium mb-1">{title}</p>
                    <p className={`text-2xl font-bold ${colorStyles[color].value}`}>{value}</p>
                    {subtitle && (
                        <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
                    )}
                    {trend && (
                        <p className={`text-sm font-medium mt-2 ${trend.up ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                            {trend.up ? '↑' : '↓'} {trend.value}
                        </p>
                    )}
                </div>
                {icon && (
                    <div className={`p-3 rounded-[var(--radius-md)] ${colorStyles[color].icon}`}>
                        {icon}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ==================== CHIP ====================
interface ChipProps {
    children: React.ReactNode;
    selected?: boolean;
    onClick?: () => void;
    icon?: React.ReactNode;
    size?: 'sm' | 'md';
}

export const Chip: React.FC<ChipProps> = ({
    children,
    selected = false,
    onClick,
    icon,
    size = 'md',
}) => {
    const sizeStyles = {
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-3 py-1.5 text-sm',
    };

    return (
        <button
            onClick={onClick}
            className={`
                inline-flex items-center gap-1.5 rounded-[var(--radius-full)] font-medium whitespace-nowrap
                transition-all duration-200 ${sizeStyles[size]}
                ${selected
                    ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--border)]'
                }
            `}
        >
            {icon}
            {children}
        </button>
    );
};

// ==================== BADGE ====================
interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'error' | 'warning' | 'primary';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
    const variants = {
        default: 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
        primary: 'bg-[var(--primary)]/10 text-[var(--primary)]',
    };

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-full)] text-xs font-medium ${variants[variant]}`}>
            {children}
        </span>
    );
};

// ==================== INPUT ====================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    icon,
    className = '',
    ...props
}) => {
    return (
        <div className="space-y-1.5">
            {label && (
                <label className="text-sm font-medium text-[var(--on-surface)]">{label}</label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        {icon}
                    </div>
                )}
                <input
                    className={`
                        w-full px-4 py-2.5 rounded-[var(--radius-md)]
                        bg-[var(--surface-variant)] border border-transparent
                        text-[var(--on-surface)] placeholder:text-[var(--text-muted)]
                        focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20
                        transition-all duration-200
                        ${icon ? 'pl-10' : ''}
                        ${error ? 'border-[var(--error)]' : ''}
                        ${className}
                    `}
                    {...props}
                />
            </div>
            {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        </div>
    );
};

// ==================== AVATAR ====================
interface AvatarProps {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    src?: string;
    color?: 'primary' | 'success' | 'error' | 'warning';
}

export const Avatar: React.FC<AvatarProps> = ({
    name,
    size = 'md',
    src,
    color = 'primary',
}) => {
    const sizeStyles = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
    };

    const colorStyles = {
        primary: 'bg-[var(--primary)]/10 text-[var(--primary)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
    };

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                className={`${sizeStyles[size]} rounded-[var(--radius-md)] object-cover`}
            />
        );
    }

    return (
        <div className={`
            ${sizeStyles[size]} ${colorStyles[color]}
            rounded-[var(--radius-md)] font-semibold
            flex items-center justify-center
        `}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
};

// ==================== LIST ITEM ====================
interface ListItemProps {
    title: string;
    subtitle?: string;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    onClick?: () => void;
}

export const ListItem: React.FC<ListItemProps> = ({
    title,
    subtitle,
    leading,
    trailing,
    onClick,
}) => {
    return (
        <div
            onClick={onClick}
            className={`
                flex items-center gap-4 p-4 rounded-[var(--radius-md)]
                ${onClick ? 'cursor-pointer hover:bg-[var(--surface-variant)] active:scale-[0.99]' : ''}
                transition-all duration-200
            `}
        >
            {leading}
            <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--on-surface)] truncate">{title}</p>
                {subtitle && (
                    <p className="text-sm text-[var(--on-surface-variant)] truncate">{subtitle}</p>
                )}
            </div>
            {trailing}
        </div>
    );
};

// ==================== EMPTY STATE ====================
interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[var(--text-muted)] mb-4 opacity-50">{icon}</div>
            <h3 className="text-lg font-medium text-[var(--on-surface)] mb-1">{title}</h3>
            {description && (
                <p className="text-[var(--on-surface-variant)] text-sm mb-4">{description}</p>
            )}
            {action}
        </div>
    );
};

// ==================== LOADING SPINNER ====================
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
    const sizeStyles = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-2',
        lg: 'w-12 h-12 border-3',
    };

    return (
        <div className={`
            ${sizeStyles[size]} 
            border-[var(--primary)] border-t-transparent 
            rounded-full animate-spin
        `} />
    );
};

// ==================== DIVIDER ====================
export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`h-px bg-[var(--border)] ${className}`} />
);

// ==================== FAB ====================
interface FabProps {
    icon: React.ReactNode;
    onClick?: () => void;
    className?: string;
}

export const Fab: React.FC<FabProps> = ({ icon, onClick, className = '' }) => {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`
                w-14 h-14 rounded-[var(--radius-lg)] 
                bg-[var(--primary)] text-[var(--on-primary)]
                shadow-lg hover:shadow-xl
                flex items-center justify-center
                transition-shadow duration-200
                ${className}
            `}
        >
            {icon}
        </motion.button>
    );
};

// ==================== SKELETON ====================
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-[var(--surface-variant)] rounded-[var(--radius-md)] ${className}`} />
);

// ==================== ALIASES FOR BACKWARD COMPATIBILITY ====================
// These aliases ensure existing imports continue to work
export const GlassCard = Card;
export const MetricCard = StatCard;
export const M3Button = Button;
