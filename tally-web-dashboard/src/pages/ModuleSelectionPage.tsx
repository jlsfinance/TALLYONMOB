import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ChevronRight, LogOut, Receipt, Smartphone } from 'lucide-react';

export default function ModuleSelectionPage() {
    const { setAppMode, signOut } = useAuth() as any;
    const { navigate } = useSafeNavigate();

    const handleSelect = (mode: 'tally' | 'billing') => {
        setAppMode(mode);
        navigate('/select-company');
    };

    const modules = [
        {
            mode: 'tally' as const,
            icon: <Smartphone size={22} strokeWidth={1.8} />,
            iconStyle: 'bg-blue-50 text-blue-700',
            title: 'Tally on Mobile',
            description: 'Access Tally data, ledgers, and reports',
        },
        {
            mode: 'billing' as const,
            icon: <Receipt size={22} strokeWidth={1.8} />,
            iconStyle: 'bg-emerald-50 text-emerald-700',
            title: 'Billing & Invoicing',
            description: 'Create invoices and manage GST billing',
        },
    ];

    return (
        <main className="min-h-screen bg-white text-black">
            <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6">
                <header className="mb-5 flex min-h-12 items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        aria-label="Back"
                        className="rounded-full p-1.5 text-black transition-colors hover:bg-gray-100"
                    >
                        <ArrowLeft size={28} strokeWidth={2.2} />
                    </button>
                    <h1 className="min-w-0 flex-1 text-xl font-bold text-black">Select Module</h1>
                    <button
                        type="button"
                        onClick={() => { signOut(); navigate('/login'); }}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                    >
                        <LogOut size={17} />
                        <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </header>

                <section aria-labelledby="modules-heading">
                    <div className="-mx-4 flex min-h-[52px] items-center bg-[#eeeeee] px-6 sm:-mx-6">
                        <h2 id="modules-heading" className="text-lg font-semibold text-black">My Modules</h2>
                    </div>

                    <ul className="divide-y divide-[#e5e5e5]">
                        {modules.map((module) => (
                            <li key={module.mode}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(module.mode)}
                                    className="group flex min-h-[92px] w-full items-center gap-4 px-3 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                >
                                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${module.iconStyle}`}>
                                        {module.icon}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-lg font-medium leading-7 text-black">{module.title}</span>
                                        <span className="mt-0.5 block text-sm text-gray-600">{module.description}</span>
                                    </span>
                                    <ChevronRight size={23} className="shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    );
}
