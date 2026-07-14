import './ProgressRing.css';

/**
 * ProgressRing - Premium Animated circular progress indicator
 * Handles positive/negative values and adds depth with multiple glows
 */
export default function ProgressRing({
    value = 0,        // -100 to 100
    size = 120,
    strokeWidth = 10,
    label,
    color = 'purple',
    showValue = true,
    animated = true,
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    // Handle extreme values and negative profit
    const absoluteValue = Math.min(Math.abs(value), 100);
    const strokeDashoffset = circumference - (absoluteValue / 100) * circumference;
    const isNegative = value < 0;

    const colorMap = {
        purple: { primary: '#8b5cf6', secondary: '#c084fc', glow: 'rgba(139, 92, 246, 0.5)' },
        blue: { primary: '#0ea5e9', secondary: '#38bdf8', glow: 'rgba(14, 165, 233, 0.5)' },
        emerald: { primary: '#10b981', secondary: '#34d399', glow: 'rgba(16, 185, 129, 0.5)' },
        gold: { primary: '#f59e0b', secondary: '#fbbf24', glow: 'rgba(245, 158, 11, 0.5)' },
        orange: { primary: '#f97316', secondary: '#fb923c', glow: 'rgba(249, 115, 22, 0.5)' },
        red: { primary: '#ef4444', secondary: '#f87171', glow: 'rgba(239, 68, 68, 0.5)' },
    };

    const palette = isNegative ? colorMap.red : (colorMap[color] || colorMap.purple);

    return (
        <div
            className={`progress-ring-container ${animated ? 'ring-animated' : ''}`}
            style={{
                width: size,
                height: size,
                '--accent-color': palette.primary,
                '--accent-glow': palette.glow
            }}
        >
            <svg className="progress-ring-svg" width={size} height={size}>
                <defs>
                    <linearGradient id={`grad-${label}-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={palette.secondary} />
                        <stop offset="100%" stopColor={palette.primary} />
                    </linearGradient>

                    <filter id={`blur-${label}`}>
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Track Circle */}
                <circle
                    className="progress-ring-track"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />

                {/* Progress Circle (Glow Layer) */}
                <circle
                    className="progress-ring-glow-layer"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    stroke={palette.primary}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />

                {/* Main Progress Circle */}
                <circle
                    className="progress-ring-fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    stroke={`url(#grad-${label}-${color})`}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>

            <div className="progress-ring-labels">
                {showValue && (
                    <div className={`ring-value ${isNegative ? 'value-negative' : ''}`}>
                        {value > 0 ? '' : value < 0 ? '-' : ''}{Math.round(absoluteValue)}%
                    </div>
                )}
                {label && <div className="ring-label-text">{label}</div>}
            </div>

            {/* Background Inner Glow */}
            <div className="ring-inner-glow" />
        </div>
    );
}
