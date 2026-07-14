import './BarChart3D.css';

/**
 * BarChart3D - Premium depth-enhanced bar chart
 * Features glassy bars, top faces for depth, and intelligent scaling
 */
export default function BarChart3D({
    data = [],        // [{ label: string, value: number }]
    height = 150,
    barColor = 'purple',
    showLabels = true,
    showValues = true,
    animated = true,
}) {
    // Optimized scaling: ensure tiny values are at least visible, and large values don't dwarf others too much
    const rawMax = Math.max(...data.map(d => d.value), 0);
    const maxValue = rawMax === 0 ? 1 : rawMax;

    const colorGradients = {
        purple: { from: '#8b5cf6', to: '#6d28d9', glow: 'rgba(139, 92, 246, 0.4)' },
        blue: { from: '#0ea5e9', to: '#0369a1', glow: 'rgba(14, 165, 233, 0.4)' },
        emerald: { from: '#10b981', to: '#047857', glow: 'rgba(16, 185, 129, 0.4)' },
        gold: { from: '#f59e0b', to: '#b45309', glow: 'rgba(245, 158, 11, 0.4)' },
        orange: { from: '#f97316', to: '#c2410c', glow: 'rgba(249, 115, 22, 0.4)' },
    };

    const palette = colorGradients[barColor] || colorGradients.purple;

    const formatValue = (val) => {
        if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
        if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
        return val.toLocaleString('en-IN');
    };

    return (
        <div className={`bar-chart-premium ${animated ? 'animate-bars' : ''}`} style={{ height }}>
            <div className="chart-base-line" />

            <div className="bars-container">
                {data.map((item, index) => {
                    // Min height of 4% ensures bars with small values are still visible as "seeds"
                    const percentage = (item.value / maxValue) * 100;
                    const barHeight = Math.max(percentage, item.value > 0 ? 4 : 0);

                    return (
                        <div key={index} className="bar-column">
                            <div className="bar-wrapper" style={{ height: `${barHeight}%` }}>
                                {showValues && item.value > 0 && (
                                    <div className="bar-value-popup">
                                        {formatValue(item.value)}
                                    </div>
                                )}

                                <div
                                    className="bar-body-3d"
                                    style={{
                                        background: `linear-gradient(180deg, ${palette.from} 0%, ${palette.to} 100%)`,
                                        '--bar-glow': palette.glow,
                                        animationDelay: `${index * 0.1}s`
                                    }}
                                >
                                    {/* Glass Shine Effect */}
                                    <div className="bar-shine-layer" />

                                    {/* 3D Top Face */}
                                    <div className="bar-top-face" style={{ backgroundColor: palette.from }} />
                                </div>
                            </div>

                            {showLabels && (
                                <div className="bar-label-text">
                                    {item.label}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
