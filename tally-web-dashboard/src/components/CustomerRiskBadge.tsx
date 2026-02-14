import { ShieldAlert, ShieldCheck, Shield, ShieldX } from 'lucide-react';

interface CustomerRiskBadgeProps {
    balance: number;
    totalReceivable: number;
    creditLimit?: number;
    compact?: boolean;
}

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export default function CustomerRiskBadge({ balance, totalReceivable, creditLimit, compact = false }: CustomerRiskBadgeProps) {
    const calculateRisk = (): { level: RiskLevel; score: number } => {
        let riskScore = 0;
        const amt = Math.abs(balance) || 0;
        const total = Math.abs(totalReceivable) || 1;

        // Concentration risk (max 40)
        const concentration = (amt / total) * 100;
        if (concentration > 30) riskScore += 40;
        else if (concentration > 20) riskScore += 30;
        else if (concentration > 10) riskScore += 20;
        else riskScore += 10;

        // Amount risk (max 30)
        if (amt > 1000000) riskScore += 30;
        else if (amt > 500000) riskScore += 20;
        else if (amt > 100000) riskScore += 10;

        // Credit limit breach (max 30)
        if (creditLimit && amt > creditLimit) riskScore += 30;

        let level: RiskLevel = 'LOW';
        if (riskScore >= 70) level = 'CRITICAL';
        else if (riskScore >= 50) level = 'HIGH';
        else if (riskScore >= 30) level = 'MEDIUM';

        return { level, score: riskScore };
    };

    const { level, score } = calculateRisk();

    const config: Record<RiskLevel, { color: string; bg: string; border: string; Icon: typeof Shield }> = {
        LOW: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', Icon: ShieldCheck },
        MEDIUM: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', Icon: Shield },
        HIGH: { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', Icon: ShieldAlert },
        CRITICAL: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: ShieldX },
    };

    const { color, bg, border, Icon } = config[level];

    if (compact) {
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color} ${bg} border ${border}`}>
                <Icon size={10} />
                {level}
            </span>
        );
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${bg} border ${border}`}>
            <Icon size={16} className={color} />
            <div>
                <span className={`text-xs font-bold ${color}`}>{level} RISK</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-1.5">Score: {score}/100</span>
            </div>
        </div>
    );
}
