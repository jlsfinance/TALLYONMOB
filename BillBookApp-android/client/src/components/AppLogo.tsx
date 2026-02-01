import React from 'react';

interface AppLogoProps {
    size?: number;
    className?: string;
    variant?: 'default' | 'monochrome';
}

const AppLogo: React.FC<AppLogoProps> = ({ size = 48, className = '', variant: _variant = 'default' }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            width={size}
            height={size}
            className={`transition-all duration-300 ${className}`}
        >
            <defs>
                {/* Light Mode Gradient */}
                <linearGradient id="lightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4F46E5" />
                    <stop offset="50%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#EC4899" />
                </linearGradient>

                {/* Dark Mode Gradient - Brighter, more vibrant */}
                <linearGradient id="darkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818CF8" />
                    <stop offset="50%" stopColor="#A78BFA" />
                    <stop offset="100%" stopColor="#F472B6" />
                </linearGradient>
            </defs>

            {/* Background - Changes with theme */}
            <rect
                x="32" y="32" width="448" height="448" rx="96" ry="96"
                className="fill-[url(#lightGradient)] dark:fill-[url(#darkGradient)]"
            />

            {/* Subtle Inner Glow */}
            <rect
                x="32" y="32" width="448" height="448" rx="96" ry="96"
                fill="none"
                className="stroke-white/20 dark:stroke-white/30"
                strokeWidth="3"
            />

            {/* Document/Bill Icon Base */}
            <g transform="translate(120, 100)">
                {/* Main Document Shape */}
                <path
                    d="M 40 0 L 200 0 L 200 270 C 200 290, 180 310, 160 310 L 40 310 C 20 310, 0 290, 0 270 L 0 40 C 0 20, 20 0, 40 0 Z"
                    className="fill-white dark:fill-slate-100"
                    fillOpacity="0.95"
                />

                {/* Folded Corner */}
                <path
                    d="M 200 0 L 200 60 C 200 75, 185 80, 170 80 L 140 80 L 200 0 Z"
                    className="fill-white/70 dark:fill-slate-200/80"
                />

                {/* Bill Lines - Theme adaptive */}
                <rect x="30" y="100" width="140" height="14" rx="7"
                    className="fill-indigo-600 dark:fill-indigo-400" fillOpacity="0.8" />
                <rect x="30" y="130" width="100" height="14" rx="7"
                    className="fill-purple-600 dark:fill-purple-400" fillOpacity="0.6" />
                <rect x="30" y="160" width="120" height="14" rx="7"
                    className="fill-pink-600 dark:fill-pink-400" fillOpacity="0.5" />

                {/* Checkmark Circle (Paid/Verified) */}
                <circle cx="150" cy="250" r="45"
                    className="fill-indigo-600 dark:fill-indigo-400" />
                <path
                    d="M 130 250 L 145 265 L 175 235"
                    stroke="white"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </g>

            {/* Currency Symbol (₹) on top right */}
            <g transform="translate(340, 80)">
                <circle cx="40" cy="40" r="50"
                    className="fill-white/25 dark:fill-white/35" />
                <text
                    x="40" y="58"
                    fontFamily="Arial, sans-serif"
                    fontSize="56"
                    fontWeight="bold"
                    fill="white"
                    textAnchor="middle"
                >
                    ₹
                </text>
            </g>
        </svg>
    );
};

// Compact version for navbar/sidebar
export const AppLogoCompact: React.FC<{ size?: number; className?: string }> = ({
    size = 32,
    className = ''
}) => {
    return (
        <div className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 transition-all duration-300 ${className}`}
            style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
                {/* Document */}
                <path
                    d="M 4 2 L 16 2 L 16 18 C 16 19, 15 20, 14 20 L 4 20 C 3 20, 2 19, 2 18 L 2 4 C 2 3, 3 2, 4 2 Z"
                    fill="white"
                    fillOpacity="0.95"
                />
                {/* Lines */}
                <rect x="4" y="7" width="10" height="1.5" rx="0.75" fill="currentColor" className="text-indigo-600 dark:text-indigo-300" fillOpacity="0.7" />
                <rect x="4" y="10" width="7" height="1.5" rx="0.75" fill="currentColor" className="text-purple-600 dark:text-purple-300" fillOpacity="0.5" />
                {/* Checkmark */}
                <circle cx="13" cy="16" r="3" className="fill-indigo-600 dark:fill-indigo-400" />
                <path d="M 11.5 16 L 12.5 17 L 14.5 15" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none" />
                {/* Currency */}
                <circle cx="19" cy="5" r="4" fill="white" fillOpacity="0.3" />
                <text x="19" y="7" fontFamily="Arial" fontSize="5" fontWeight="bold" fill="white" textAnchor="middle">₹</text>
            </svg>
        </div>
    );
};

// Text Logo with icon
export const AppLogoWithText: React.FC<{ size?: number; className?: string }> = ({
    size = 40,
    className = ''
}) => {
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <AppLogoCompact size={size} />
            <div className="flex flex-col">
                <span className="text-lg font-black tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                    JLS Suite
                </span>
                <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase -mt-0.5">
                    Business Suite
                </span>
            </div>
        </div>
    );
};

export default AppLogo;
