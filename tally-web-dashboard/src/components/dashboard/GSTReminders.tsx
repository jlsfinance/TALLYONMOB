import { useMemo } from 'react';
import { format, addMonths, startOfMonth, setDate, differenceInDays } from 'date-fns';
import { AlertCircle, Calendar, Bell, Shield } from 'lucide-react';
import { Card, Badge } from '../ui/GlassUI';

export default function GSTReminders() {
    const reminders = useMemo(() => {
        const today = new Date();
        const nextMonth = addMonths(today, 1);

        // GSTR-1: 11th of next month
        const gstr1_deadline = setDate(startOfMonth(nextMonth), 11);
        const gstr1_days = differenceInDays(gstr1_deadline, today);

        // GSTR-3B: 20th of next month
        const gstr3b_deadline = setDate(startOfMonth(nextMonth), 20);
        const gstr3b_days = differenceInDays(gstr3b_deadline, today);

        return [
            {
                name: 'GSTR-1 (Monthly)',
                date: gstr1_deadline,
                daysRemaining: gstr1_days,
                status: gstr1_days < 3 ? 'critical' : gstr1_days < 7 ? 'warning' : 'info'
            },
            {
                name: 'GSTR-3B (Monthly)',
                date: gstr3b_deadline,
                daysRemaining: gstr3b_days,
                status: gstr3b_days < 3 ? 'critical' : gstr3b_days < 7 ? 'warning' : 'info'
            }
        ];
    }, []);

    return (
        <Card className="border border-white/5 overflow-hidden relative">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                    <Shield size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-white">GST Compliance</h3>
                    <p className="text-xs text-[var(--on-surface-variant)]">Automatic filing reminders</p>
                </div>
            </div>

            <div className="space-y-4">
                {reminders.map((rem, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${rem.status === 'critical' ? 'bg-red-500/20 text-red-400' :
                                rem.status === 'warning' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                <Calendar size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">{rem.name}</p>
                                <p className="text-[10px] text-[var(--on-surface-variant)] uppercase font-bold">
                                    {format(rem.date, 'dd MMM yyyy')}
                                </p>
                            </div>
                        </div>

                        <div className="text-right">
                            <p className={`text-xs font-bold ${rem.status === 'critical' ? 'text-red-400' :
                                rem.status === 'warning' ? 'text-orange-400' : 'text-blue-400'
                                }`}>
                                {rem.daysRemaining} Days Left
                            </p>
                            <Badge variant={
                                rem.status === 'critical' ? 'error' :
                                    rem.status === 'warning' ? 'warning' : 'primary'
                            }>
                                {rem.status === 'critical' ? 'Immediate' : 'Upcoming'}
                            </Badge>
                        </div>
                    </div>
                ))}
            </div>

            <button className="w-full mt-4 py-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest border-t border-white/5 pt-4">
                View All Tax Calendars
            </button>
        </Card>
    );
}
