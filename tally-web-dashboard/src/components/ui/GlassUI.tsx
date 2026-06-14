import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

// =====================================================
// NEO-GLASS UI COMPONENT LIBRARY v2.1
// Restored Missing Components + Modern Styling
// =====================================================

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
        sm: 'p-3 md:p-4',
        md: 'p-4 md:p-6',
        lg: 'p-6 md:p-8',
        xl: 'p-8 md:p-10',
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
    const isSolid = variant === 'solid';

    const colorStyles = {
        default: 'bg-[var(--surface-active)] text-[var(--on-surface)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
        primary: 'bg-[var(--primary-light)]/20 text-[var(--primary)]',
        info: 'bg-[var(--info-bg)] text-[var(--info)]',
    };

    const solidBgStyles = {
        default: 'bg-[var(--surface)] text-[var(--on-surface)]',
        success: 'bg-[#10B981] text-white border-transparent shadow-[#10B981]/30', // Vivid Emerald
        warning: 'bg-[#F59E0B] text-white border-transparent shadow-[#F59E0B]/30', // Vivid Amber
        error: 'bg-[#EF4444] text-white border-transparent shadow-[#EF4444]/30',
        primary: 'bg-[var(--primary)] text-white border-transparent shadow-[var(--primary)]/30',
        info: 'bg-[#3B82F6] text-white border-transparent shadow-[#3B82F6]/30',
    };

    return (
        <motion.div
            whileHover={{ y: -5 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={onClick}
            className={`
                relative overflow-hidden rounded-[var(--radius-xl)] p-4 md:p-6
                min-w-0 w-full
                ${isSolid
                    ? `${solidBgStyles[color]} shadow-lg`
                    : `bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--primary-light)]`
                }
                cursor-pointer group
            `}
        >
            {/* Background Decor for Solid Cards */}
            {isSolid && (
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl transition-transform group-hover:scale-150" />
            )}

            {/* Standard Background Glow for Default Cards */}
            {!isSolid && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--primary)]/5 rounded-full blur-[40px] -translate-y-1/2 translate-x-1/3 group-hover:bg-[var(--primary)]/10 transition-colors" />
            )}

            <div className="flex items-start justify-between relative z-10">
                <div>
                    <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isSolid ? 'text-white/80' : 'text-[var(--on-surface-variant)]'}`}>{title}</p>
                    <h3 className={`text-3xl font-bold tracking-tight ${isSolid ? 'text-white' : 'text-[var(--on-background)]'}`}>{value}</h3>

                    {(subtitle || trend) && (
                        <div className="flex items-center gap-2 mt-3">
                            {trend && (
                                <span className={`
                                    inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold
                                    ${isSolid
                                        ? 'bg-white/20 text-white backdrop-blur-sm'
                                        : (trend.up ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]')
                                    }
                                `}>
                                    {trend.up ? '↑' : '↓'} {trend.value}
                                </span>
                            )}
                            {subtitle && (
                                <p className={`text-xs truncate max-w-[120px] ${isSolid ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>{subtitle}</p>
                            )}
                        </div>
                    )}
                </div>

                {icon && (
                    <div className={`
                        w-12 h-12 rounded-[var(--radius-lg)] flex items-center justify-center text-xl
                        ${isSolid
                            ? 'bg-white/20 text-white backdrop-blur-md' // Glassy icon container for solid cards
                            : `${colorStyles[color]} transition-transform group-hover:scale-110 group-hover:rotate-3`
                        }
                    `}>
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
    className?: string;
}

export const Chip: React.FC<ChipProps> = ({
    children,
    selected = false,
    onClick,
    icon,
    size = 'md',
    className = '',
}) => {
    const sizeStyles = {
        sm: 'px-3 py-1 text-xs',
        md: 'px-4 py-2 text-sm',
    };

    return (
        <button
            onClick={onClick}
            className={`
                inline-flex items-center gap-2 rounded-full font-semibold transition-all duration-200 ${sizeStyles[size]} ${className}
                border
                ${selected
                    ? 'bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)] shadow-[var(--shadow-sm)]'
                    : 'bg-[var(--surface)] text-[var(--on-surface-variant)] border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--on-surface-variant)]/30'
                }
            `}
        >
            {icon}
            {children}
        </button>
    );
};

// ==================== AVATAR (Restored) ====================
interface AvatarProps {
    name: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    src?: string;
    color?: 'primary' | 'success' | 'error' | 'warning' | 'info' | 'default';
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
        xl: 'w-16 h-16 text-lg',
    };

    const colorStyles = {
        default: 'bg-[var(--surface-active)] text-[var(--on-surface)]',
        primary: 'bg-[var(--primary-light)]/20 text-[var(--primary)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
        info: 'bg-[var(--info-bg)] text-[var(--info)]',
    };

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                className={`${sizeStyles[size]} rounded-[var(--radius-lg)] object-cover ring-2 ring-[var(--surface)]`}
            />
        );
    }

    return (
        <div className={`
            ${sizeStyles[size]} ${colorStyles[color]}
            rounded-[var(--radius-lg)] font-bold
            flex items-center justify-center
            ring-2 ring-[var(--surface)]
        `}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
};

// ==================== FAB (Restored) ====================
interface FabProps {
    icon: React.ReactNode;
    onClick?: () => void;
    className?: string;
}

export const Fab: React.FC<FabProps> = ({ icon, onClick, className = '' }) => {
    return (
        <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            className={`
                w-14 h-14 rounded-full
                bg-gradient-to-tr from-[var(--primary)] to-[var(--primary-light)] text-[var(--on-primary)]
                shadow-[0_10px_20px_rgba(79,70,229,0.3)] 
                hover:shadow-[0_15px_30px_rgba(79,70,229,0.5)]
                flex items-center justify-center
                transition-all duration-300
                ${className}
            `}
        >
            {icon}
        </motion.button>
    );
};

// ==================== BADGE (Restored) ====================
interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'error' | 'warning' | 'primary' | 'info' | 'outline';
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => {
    const variants = {
        default: 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        error: 'bg-[var(--error-bg)] text-[var(--error)]',
        warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
        primary: 'bg-[var(--primary)]/10 text-[var(--primary)]',
        info: 'bg-[var(--info-bg)] text-[var(--info)]',
        outline: 'border border-[var(--outline-variant)] text-[var(--on-surface-variant)] bg-transparent',
    };

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
};

// ==================== EMPTY STATE (Restored) ====================
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
            <div className="text-[var(--text-muted)] mb-4 opacity-50 bg-[var(--surface-hover)] p-6 rounded-full">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-[var(--on-surface)] mb-2">{title}</h3>
            {description && (
                <p className="text-[var(--on-surface-variant)] text-sm mb-6 max-w-sm mx-auto">{description}</p>
            )}
            {action}
        </div>
    );
};

// ==================== INPUT (Modern) ====================
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
        <div className="space-y-2">
            {label && (
                <label className="text-sm font-semibold text-[var(--on-surface)] ml-1">{label}</label>
            )}
            <div className="relative group">
                {icon && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                        {icon}
                    </div>
                )}
                <input
                    className={`
                        w-full px-5 py-3 rounded-[var(--radius-lg)]
                        bg-[var(--surface)] border border-[var(--border)]
                        text-[var(--on-surface)] placeholder:text-[var(--text-muted)]
                        focus:outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10
                        transition-all duration-200
                        ${icon ? 'pl-11' : ''}
                        ${error ? 'border-[var(--error)] focus:ring-[var(--error)]/10' : ''}
                        ${className}
                    `}
                    {...props}
                />
            </div>
            {error && <p className="text-xs font-medium text-[var(--error)] ml-1">{error}</p>}
        </div>
    );
};

// ==================== LIST ITEM ====================
export const ListItem: React.FC<any> = ({ title, subtitle, leading, trailing, onClick }) => (
    <div
        onClick={onClick}
        className={`
            flex items-center gap-4 p-4 rounded-[var(--radius-lg)]
            bg-[var(--surface)] border border-transparent
            ${onClick ? 'cursor-pointer hover:bg-[var(--surface-hover)] hover:border-[var(--border)] hover:shadow-[var(--shadow-sm)]' : ''}
            transition-all duration-200
        `}
    >
        {leading}
        <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--on-surface)] truncate">{title}</p>
            {subtitle && <p className="text-sm text-[var(--on-surface-variant)] truncate">{subtitle}</p>}
        </div>
        {trailing}
    </div>
);

// ==================== SPINNER ====================
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
    const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
    return <div className={`${sizeMap[size]} border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin`} />;
};

// ==================== ALIASES ====================
export const GlassCard = Card;
export const MetricCard = StatCard;
export const M3Button = Button;
