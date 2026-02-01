import './ProgressRing.css';

/**
 * ProgressRing - Animated circular progress indicator with neon glow
 */
export default function ProgressRing({
    value = 0,        // 0-100
    size = 120,
    strokeWidth = 8,
    label,
    color = 'purple', // purple, blue, emerald, gold, orange, red
    showValue = true,
    animated = true,
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    const colorMap = {
        purple: '#8b5cf6',
        blue: '#00d4ff',
        emerald: '#10b981',
        gold: '#f59e0b',
        orange: '#f97316',
        red: '#ef4444',
    };

    const glowColor = colorMap[color] || colorMap.purple;

    return (
        <div
            className={`progress-ring-component ${animated ? 'progress-ring--animated' : ''}`}
            style={{ width: size, height: size }}
        >
            <svg className="progress-ring__svg" width={size} height={size}>
                <defs>
                    <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={glowColor} />
                        <stop offset="100%" stopColor={colorMap.blue} />
                    </linearGradient>
                    <filter id={`glow-${color}`}>
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Background circle */}
                <circle
                    className="progress-ring__circle-bg"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />

                {/* Progress circle */}
                <circle
                    className="progress-ring__circle-progress"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    stroke={`url(#gradient-${color})`}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    filter={`url(#glow-${color})`}
                    style={{
                        '--glow-color': glowColor,
                    }}
                />
            </svg>

            <div className="progress-ring__content">
                {showValue && (
                    <span
                        className="progress-ring__value"
                        style={{ color: glowColor }}
                    >
                        {Math.round(value)}%
                    </span>
                )}
                {label && <span className="progress-ring__label">{label}</span>}
            </div>
        </div>
    );
}
