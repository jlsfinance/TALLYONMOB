import { useState } from 'react';
import './KPICard.css';

/**
 * KPICard - Premium 3D KPI Display Card
 * For displaying key metrics with icons, values, and trend indicators
 */
export default function KPICard({
    title,
    value,
    subtitle,
    icon,
    trend,       // { value: number, direction: 'up' | 'down' | 'neutral' }
    variant = 'default', // sales, purchases, outstanding, profit
    size = 'md',
    tilt = true,
    onClick,
}) {
    const [tiltStyle, setTiltStyle] = useState({});

    const handleMouseMove = (e) => {
        if (!tilt) return;

        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        setTiltStyle({
            transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`,
        });
    };

    const handleMouseLeave = () => {
        if (!tilt) return;
        setTiltStyle({
            transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        });
    };

    const formatValue = (val) => {
        if (typeof val === 'number') {
            if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
            if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
            if (val >= 1000) return `₹${(val / 1000).toFixed(1)} K`;
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(val);
        }
        return val;
    };

    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.direction === 'up') return '↑';
        if (trend.direction === 'down') return '↓';
        return '→';
    };

    const classes = [
        'kpi-card-component',
        `kpi-card--${variant}`,
        `kpi-card--${size}`,
        tilt && 'kpi-card--tilt',
        onClick && 'kpi-card--clickable',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={tiltStyle}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
        >
            <div className="kpi-card__header">
                {icon && <span className="kpi-card__icon">{icon}</span>}
                <p className="kpi-card__title">{title}</p>
            </div>

            <div className="kpi-card__value">{formatValue(value)}</div>

            {(subtitle || trend) && (
                <div className="kpi-card__footer">
                    {trend && (
                        <span className={`kpi-card__trend kpi-card__trend--${trend.direction}`}>
                            {getTrendIcon()} {Math.abs(trend.value)}%
                        </span>
                    )}
                    {subtitle && <span className="kpi-card__subtitle">{subtitle}</span>}
                </div>
            )}

            <div className="kpi-card__glow" />
            <div className="kpi-card__shine" />
        </div>
    );
}
