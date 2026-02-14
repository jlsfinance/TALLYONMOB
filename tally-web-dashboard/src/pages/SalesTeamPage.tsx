import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    MapPin, Clock, CheckCircle, Users, Loader2, Calendar,
    Navigation, ArrowRight, Phone, User, Target, BarChart3,
    Play, Square, TrendingUp, MapPinOff
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Visit {
    id: string;
    party_name: string;
    check_in_time: string;
    check_out_time?: string;
    latitude: number;
    longitude: number;
    notes: string;
    salesperson: string;
    status: 'checked_in' | 'checked_out';
}

export default function SalesTeamPage() {
    const { selectedCompany, user } = useAuth() as any;
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'checkin' | 'today' | 'reports'>('checkin');
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
    const [parties, setParties] = useState<any[]>([]);
    const [selectedParty, setSelectedParty] = useState('');
    const [partySearch, setPartySearch] = useState('');
    const [visitNotes, setVisitNotes] = useState('');
    const [locating, setLocating] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadParties();
            loadTodayVisits();
        }
    }, [selectedCompany]);

    const loadParties = async () => {
        const { data } = await supabase
            .from('ledgers')
            .select('id, name, phone, address')
            .eq('company_id', selectedCompany.id)
            .in('parent', ['Sundry Debtors', 'sundry debtors', 'SUNDRY DEBTORS'])
            .order('name')
            .limit(1000);
        setParties(data || []);
    };

    const loadTodayVisits = async () => {
        const today = new Date().toISOString().split('T')[0];
        try {
            const { data } = await supabase
                .from('sales_visits')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('check_in_time', today)
                .order('check_in_time', { ascending: false });
            setVisits(data || []);
        } catch {
            // Table may not exist
        }
    };

    const getLocation = (): Promise<{ lat: number, lng: number }> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    };

    const handleCheckIn = async () => {
        if (!selectedParty) {
            toast.error('Please select a party/customer');
            return;
        }

        setLocating(true);
        try {
            const location = await getLocation();
            setCurrentLocation(location);

            const visit: Visit = {
                id: Date.now().toString(),
                party_name: selectedParty,
                check_in_time: new Date().toISOString(),
                latitude: location.lat,
                longitude: location.lng,
                notes: visitNotes,
                salesperson: user?.email || 'Unknown',
                status: 'checked_in'
            };

            try {
                await supabase.from('sales_visits').insert({
                    company_id: selectedCompany.id,
                    party_name: selectedParty,
                    check_in_time: visit.check_in_time,
                    latitude: location.lat,
                    longitude: location.lng,
                    notes: visitNotes,
                    salesperson: user?.email,
                    status: 'checked_in'
                });
            } catch { /* Table may not exist */ }

            setCurrentVisit(visit);
            setIsCheckedIn(true);
            setVisits(prev => [visit, ...prev]);
            toast.success(`✅ Checked in at ${selectedParty}`);
        } catch (err: any) {
            toast.error('Location access denied. Please enable GPS.');
        } finally {
            setLocating(false);
        }
    };

    const handleCheckOut = async () => {
        if (!currentVisit) return;

        try {
            const location = await getLocation();
            const updated = { ...currentVisit, check_out_time: new Date().toISOString(), status: 'checked_out' as const };

            setVisits(prev => prev.map(v => v.id === currentVisit.id ? updated : v));
            setIsCheckedIn(false);
            setCurrentVisit(null);
            setSelectedParty('');
            setVisitNotes('');
            toast.success('👋 Checked out successfully');
        } catch {
            // Even without location, allow checkout
            setIsCheckedIn(false);
            setCurrentVisit(null);
            toast.success('👋 Checked out');
        }
    };

    const filteredParties = useMemo(() => {
        if (!partySearch) return parties.slice(0, 20);
        return parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 20);
    }, [parties, partySearch]);

    const todayStats = useMemo(() => {
        const checkedOut = visits.filter(v => v.status === 'checked_out');
        return {
            totalVisits: visits.length,
            completed: checkedOut.length,
            inProgress: visits.filter(v => v.status === 'checked_in').length,
        };
    }, [visits]);

    const formatTime = (dateStr: string) =>
        new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <MapPin className="w-6 h-6 text-emerald-400" />
                    Sales Team Tracking
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Check-in at customer locations, track visits</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Today's Visits</p>
                    <p className="text-xl font-bold text-emerald-400">{todayStats.totalVisits}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Completed</p>
                    <p className="text-xl font-bold text-green-400">{todayStats.completed}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">In Progress</p>
                    <p className="text-xl font-bold text-amber-400">{todayStats.inProgress}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {(['checkin', 'today', 'reports'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]'
                            }`}>
                        {tab === 'checkin' ? '📍 Check In' : tab === 'today' ? '📋 Today' : '📊 Reports'}
                    </button>
                ))}
            </div>

            {/* Check In/Out */}
            {activeTab === 'checkin' && (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                    {isCheckedIn ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                                <MapPin className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-emerald-400">Checked In</h3>
                            <p className="text-sm text-[var(--on-surface)] mt-1">{currentVisit?.party_name}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">Since {currentVisit ? formatTime(currentVisit.check_in_time) : ''}</p>

                            <button onClick={handleCheckOut}
                                className="mt-6 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto hover:bg-red-600 transition-all">
                                <Square className="w-5 h-5" /> Check Out
                            </button>
                        </div>
                    ) : (
                        <>
                            <h3 className="font-semibold text-[var(--on-surface)] mb-3">New Visit Check-In</h3>

                            <div className="mb-3">
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Customer/Party</label>
                                <input type="text" value={selectedParty || partySearch}
                                    onChange={(e) => { setPartySearch(e.target.value); setSelectedParty(''); }}
                                    placeholder="Search customer..."
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                                />
                                {partySearch && !selectedParty && (
                                    <div className="mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg max-h-40 overflow-y-auto">
                                        {filteredParties.map(p => (
                                            <button key={p.id} onClick={() => { setSelectedParty(p.name); setPartySearch(''); }}
                                                className="w-full text-left px-3 py-2 text-sm text-[var(--on-surface)] hover:bg-[var(--surface)] border-b border-[var(--border)] last:border-0">
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className="text-xs text-[var(--text-muted)] mb-1 block">Notes (Optional)</label>
                                <textarea value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)}
                                    placeholder="Purpose of visit..."
                                    rows={2}
                                    className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] resize-none"
                                />
                            </div>

                            <button onClick={handleCheckIn} disabled={!selectedParty || locating}
                                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50 transition-all">
                                {locating ? <><Loader2 className="w-5 h-5 animate-spin" /> Getting location...</> : <><Navigation className="w-5 h-5" /> Check In with GPS</>}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Today's Visits */}
            {activeTab === 'today' && (
                <div className="space-y-2">
                    {visits.length === 0 ? (
                        <div className="text-center py-20">
                            <MapPinOff className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-[var(--on-surface)]">No visits today</h3>
                        </div>
                    ) : visits.map(visit => (
                        <div key={visit.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-[var(--on-surface)]">{visit.party_name}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-[var(--text-muted)]">🕐 {formatTime(visit.check_in_time)}</span>
                                        {visit.check_out_time && <span className="text-xs text-[var(--text-muted)]">→ {formatTime(visit.check_out_time)}</span>}
                                    </div>
                                    {visit.notes && <p className="text-xs text-[var(--text-muted)] mt-1">📝 {visit.notes}</p>}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full ${visit.status === 'checked_in' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                                    }`}>
                                    {visit.status === 'checked_in' ? '🟡 Active' : '✅ Done'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reports */}
            {activeTab === 'reports' && (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 text-center">
                    <BarChart3 className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--on-surface)]">Visit Analytics</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Coming with data accumulation</p>
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <div className="bg-[var(--background)] rounded-lg p-3">
                            <p className="text-2xl font-bold text-emerald-400">{visits.length}</p>
                            <p className="text-xs text-[var(--text-muted)]">Total Visits Today</p>
                        </div>
                        <div className="bg-[var(--background)] rounded-lg p-3">
                            <p className="text-2xl font-bold text-blue-400">{new Set(visits.map(v => v.party_name)).size}</p>
                            <p className="text-xs text-[var(--text-muted)]">Unique Customers</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
