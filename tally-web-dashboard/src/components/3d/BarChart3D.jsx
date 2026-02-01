import './BarChart3D.css';

/**
 * BarChart3D - Premium 3D bar chart with gradient bars and glow effects
 */
export default function BarChart3D({
    data = [],        // [{ label: string, value: number }]
    height = 200,
    barColor = 'purple', // purple, blue, emerald, gold, orange
    showLabels = true,
    showValues = true,
    animated = true,
}) {
    const maxValue = Math.max(...data.map(d => d.value), 1);

    const colorGradients = {
        purple: ['#8b5cf6', '#a78bfa'],
        blue: ['#00d4ff', '#22d3ee'],
        emerald: ['#10b981', '#34d399'],
        gold: ['#f59e0b', '#fbbf24'],
        orange: ['#f97316', '#fb923c'],
    };

    const gradient = colorGradients[barColor] || colorGradients.purple;

    const formatValue = (val) => {
        if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
        if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
        return val.toLocaleString('en-IN');
    };

    return (
        <div className={`bar-chart-3d ${animated ? 'bar-chart-3d--animated' : ''}`}>
            <div className="bar-chart-3d__container" style={{ height }}>
                {data.map((item, index) => {
                    const barHeight = (item.value / maxValue) * 100;

                    return (
                        <div key={index} className="bar-chart-3d__bar-wrapper">
                            <div className="bar-chart-3d__bar-container">
                                {showValues && (
                                    <div className="bar-chart-3d__value">
                                        {formatValue(item.value)}
                                    </div>
                                )}
                                <div
                                    className="bar-chart-3d__bar"
                                    style={{
                                        height: `${barHeight}%`,
                                        background: `linear-gradient(180deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
                                        '--glow-color': gradient[0],
                                        animationDelay: `${index * 0.1}s`,
                                    }}
                                >
                                    <div className="bar-chart-3d__bar-shine" />
                                </div>
                            </div>
                            {showLabels && (
                                <span className="bar-chart-3d__label">
                                    {item.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
