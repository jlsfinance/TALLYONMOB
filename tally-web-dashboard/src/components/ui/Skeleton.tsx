import React from 'react';

interface SkeletonProps {
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
    return (
        <div className={`animate-pulse bg-[var(--surface-variant)] border border-[var(--border)]/20 ${className}`} />
    );
};

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 1, className = '' }) => {
    return (
        <div className={`space-y-2.5 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <div 
                    key={i} 
                    className="h-4 bg-[var(--surface-variant)] animate-pulse rounded-[2px] first:w-3/4 last:w-1/2 w-full"
                />
            ))}
        </div>
    );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`p-5 bg-[var(--surface)] border border-[var(--border)] rounded-[2px] space-y-4 shadow-[var(--shadow-sm)] ${className}`}>
            <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
                <div className="h-8 w-8 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
            </div>
            <div className="h-8 w-32 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
            <div className="h-3 w-40 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
        </div>
    );
};

export const SkeletonTable: React.FC<{ rows?: number; cols?: number; className?: string }> = ({ 
    rows = 5, 
    cols = 4, 
    className = '' 
}) => {
    return (
        <div className={`w-full overflow-hidden border border-[var(--border)] rounded-[2px] bg-[var(--surface)] ${className}`}>
            {/* Table Header */}
            <div className="grid h-12 items-center px-6 border-b border-[var(--border)] bg-[var(--surface-container)]"
                 style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="h-4 w-16 bg-[var(--surface-variant)]/60 animate-pulse rounded-[2px]" />
                ))}
            </div>
            {/* Table Rows */}
            <div className="divide-y divide-[var(--border)]">
                {Array.from({ length: rows }).map((_, r) => (
                    <div 
                        key={r} 
                        className="grid h-16 items-center px-6"
                        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                    >
                        {Array.from({ length: cols }).map((_, c) => (
                            <div 
                                key={c} 
                                className="h-4 bg-[var(--surface-variant)] animate-pulse rounded-[2px]"
                                style={{ width: c === 0 ? '70%' : c === cols - 1 ? '50%' : '85%' }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SkeletonChart: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`p-5 bg-[var(--surface)] border border-[var(--border)] rounded-[2px] space-y-6 ${className}`}>
            <div className="h-4 w-36 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
            <div className="h-48 flex items-end justify-between gap-2.5 pt-4">
                {[40, 70, 45, 90, 60, 30, 80, 50, 65, 85, 40, 95].map((h, i) => (
                    <div 
                        key={i} 
                        className="w-full bg-[var(--surface-variant)]/60 animate-pulse rounded-[2px]"
                        style={{ height: `${h}%` }}
                    />
                ))}
            </div>
            <div className="flex justify-between text-xs">
                <div className="h-3 w-8 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
                <div className="h-3 w-8 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
                <div className="h-3 w-8 bg-[var(--surface-variant)] animate-pulse rounded-[2px]" />
            </div>
        </div>
    );
};
