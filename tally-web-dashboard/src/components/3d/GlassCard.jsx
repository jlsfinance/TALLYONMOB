import { useState } from 'react';
import './GlassCard.css';

/**
 * GlassCard - Premium 3D Glassmorphism Card Component
 * Supports various variants and 3D tilt effects
 */
export default function GlassCard({
    children,
    variant = 'default', // default, sales, purchases, outstanding, profit, info
    size = 'md', // sm, md, lg
    tilt = false,
    glow = false,
    animated = false,
    className = '',
    onClick,
    ...props
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

        const rotateX = ((y - centerY) / centerY) * -8;
        const rotateY = ((x - centerX) / centerX) * 8;

        setTiltStyle({
            transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`,
        });
    };

    const handleMouseLeave = () => {
        if (!tilt) return;
        setTiltStyle({
            transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        });
    };

    const classes = [
        'glass-card-component',
        `glass-card--${variant}`,
        `glass-card--${size}`,
        tilt && 'glass-card--tilt',
        glow && 'glass-card--glow',
        animated && 'glass-card--animated',
        onClick && 'glass-card--clickable',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={tiltStyle}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={onClick}
            {...props}
        >
            <div className="glass-card__content">
                {children}
            </div>
            <div className="glass-card__border-glow" />
        </div>
    );
}
