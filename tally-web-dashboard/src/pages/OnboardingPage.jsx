import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Download,
    Monitor,
    RefreshCw,
    CheckCircle,
    ArrowRight,
    Smartphone,
    Cloud,
    Settings,
    Zap,
    FileText,
    Package,
    BookOpen,
    Sparkles,
    Receipt,
    ChevronRight,
    Play
} from 'lucide-react';
import { companyApi } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

const OnboardingPage = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [companies, setCompanies] = useState([]);
    const [isChecking, setIsChecking] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState('https://github.com/jlsfinance/tallyonmob/releases/latest/download/TallySyncSetup.exe');

    useEffect(() => {
        checkForCompanies();
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data } = await companyApi.getAppSettings?.() || {};
            if (data?.windows_app_download_url) {
                setDownloadUrl(data.windows_app_download_url);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    };

    const checkForCompanies = async () => {
        setIsChecking(true);
        try {
            const { data } = await companyApi.list();
            setCompanies(data || []);
            // Only auto-navigate if on step 3 (success)
            if (data && data.length > 0 && currentStep === 3) {
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (error) {
            console.error('Error checking companies:', error);
        } finally {
            setIsChecking(false);
        }
    };

    const handleDownload = () => {
        window.open(downloadUrl, '_blank');
        setTimeout(() => setCurrentStep(2), 500);
    };

    const handleCheckStatus = () => {
        checkForCompanies();
    };

    const handleGoToDashboard = () => {
        navigate('/');
    };

    const handleGoToBilling = () => {
        navigate('/create-invoice');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-700" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-3xl" />
            </div>

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

            {/* Content */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
                {/* Top Right Buttons */}
                <div className="absolute top-6 right-6 flex items-center gap-3">
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => navigate('/select-company')}
                        className="px-6 py-3 bg-blue-500/20 backdrop-blur-sm border border-blue-500/30 rounded-2xl font-bold text-blue-400 hover:bg-blue-500/30 transition-all"
                    >
                        Select Company
                    </motion.button>
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl font-bold text-white hover:bg-white/20 transition-all"
                    >
                        Skip for now →
                    </motion.button>
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        onClick={async () => {
                            await signOut();
                            navigate('/login');
                        }}
                        className="px-6 py-3 bg-red-500/10 backdrop-blur-sm border border-red-500/20 rounded-2xl font-bold text-red-400 hover:bg-red-500/20 transition-all"
                    >
                        Logout
                    </motion.button>
                </div>

                {/* Logo & Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 mb-6 shadow-2xl shadow-blue-500/50">
                        <Sparkles className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-white mb-4 tracking-tight">
                        Welcome to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">TallyOnMob</span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Sync your Tally data to the cloud and access it anywhere, anytime
                    </p>
                </motion.div>

                {/* Progress Steps */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-4 mb-12"
                >
                    {[1, 2, 3].map((step) => (
                        <React.Fragment key={step}>
                            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl transition-all duration-500 ${currentStep >= step
                                ? 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-blue-500/50'
                                : 'bg-white/5 backdrop-blur-sm border border-white/10'
                                }`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all ${currentStep >= step ? 'bg-white text-blue-600' : 'bg-white/10 text-gray-400'
                                    }`}>
                                    {currentStep > step ? <CheckCircle className="w-5 h-5" /> : step}
                                </div>
                                <span className={`font-bold text-sm ${currentStep >= step ? 'text-white' : 'text-gray-500'
                                    }`}>
                                    {step === 1 && 'Download'}
                                    {step === 2 && 'Connect'}
                                    {step === 3 && 'Success'}
                                </span>
                            </div>
                            {step < 3 && (
                                <ChevronRight className={`w-5 h-5 transition-colors ${currentStep > step ? 'text-blue-400' : 'text-gray-600'
                                    }`} />
                            )}
                        </React.Fragment>
                    ))}
                </motion.div>

                {/* Main Content Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="w-full max-w-5xl"
                >
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
                        <AnimatePresence mode="wait">
                            {/* Step 1: Download */}
                            {currentStep === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="text-center mb-8">
                                        <h2 className="text-3xl font-black text-white mb-3">Download Windows Sync App</h2>
                                        <p className="text-gray-400">Install our desktop app to connect your Tally data</p>

                                        {/* Show if user already has companies */}
                                        {companies.length > 0 && (
                                            <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-2xl p-4 max-w-md mx-auto">
                                                <p className="text-green-400 font-bold mb-2">
                                                    ✓ You already have {companies.length} {companies.length === 1 ? 'company' : 'companies'} synced
                                                </p>
                                                <button
                                                    onClick={() => navigate('/')}
                                                    className="px-6 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-all"
                                                >
                                                    Go to Dashboard →
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Flow Diagram */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                        {[
                                            { icon: Smartphone, label: 'Mobile', color: 'from-green-500 to-emerald-600' },
                                            { icon: Cloud, label: 'Cloud Sync', color: 'from-blue-500 to-cyan-600' },
                                            { icon: Monitor, label: 'Windows App', color: 'from-purple-500 to-pink-600' },
                                            { icon: FileText, label: 'Tally Data', color: 'from-orange-500 to-red-600' }
                                        ].map((item, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.4 + idx * 0.1 }}
                                                className="relative group"
                                            >
                                                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-all duration-300 hover:scale-105">
                                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg`}>
                                                        <item.icon className="w-8 h-8 text-white" />
                                                    </div>
                                                    <p className="text-sm font-bold text-white">{item.label}</p>
                                                </div>
                                                {idx < 3 && (
                                                    <div className="hidden md:block absolute top-1/2 -right-2 transform translate-x-full -translate-y-1/2 z-10">
                                                        <ChevronRight className="w-6 h-6 text-blue-400" />
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Download Button */}
                                    <div className="flex flex-col items-center gap-4">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={handleDownload}
                                            className="group relative px-12 py-5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl font-black text-lg text-white shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 transition-all overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="relative flex items-center gap-3">
                                                <Download className="w-6 h-6" />
                                                <span>Download for Windows</span>
                                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </motion.button>

                                        {/* System Requirements */}
                                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 max-w-md">
                                            <p className="text-xs text-gray-400 text-center">
                                                <span className="font-bold text-white">System Requirements:</span> Windows 10/11, Tally Prime/ERP 9
                                            </p>
                                        </div>

                                        {/* Select Company Button - Only if has companies */}
                                        {companies.length > 0 && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => navigate('/select-company')}
                                                className="px-10 py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl font-black text-white shadow-2xl shadow-green-500/50 hover:shadow-green-500/70 transition-all"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle className="w-5 h-5" />
                                                    <span>Select Existing Company</span>
                                                    <ArrowRight className="w-5 h-5" />
                                                </div>
                                            </motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {/* Step 2: Connect */}
                            {currentStep === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-8"
                                >
                                    <div className="text-center mb-8">
                                        <h2 className="text-3xl font-black text-white mb-3">Setup Instructions</h2>
                                        <p className="text-gray-400">Follow these simple steps to connect your Tally</p>
                                    </div>

                                    {/* Instruction Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            {
                                                step: '1',
                                                icon: Monitor,
                                                title: 'Open Tally',
                                                desc: 'Launch Tally Prime or ERP 9 on your computer',
                                                color: 'from-blue-500 to-cyan-600'
                                            },
                                            {
                                                step: '2',
                                                icon: Settings,
                                                title: 'Enable ODBC',
                                                desc: 'Go to Gateway → F12 → Advanced Config → Enable ODBC Server',
                                                color: 'from-purple-500 to-pink-600'
                                            },
                                            {
                                                step: '3',
                                                icon: Cloud,
                                                title: 'Sign In with Google',
                                                desc: 'Open the Windows app and sign in with your Google account',
                                                color: 'from-green-500 to-emerald-600'
                                            },
                                            {
                                                step: '4',
                                                icon: Zap,
                                                title: 'Start Sync',
                                                desc: 'Select your company and click "Start Sync" to begin',
                                                color: 'from-orange-500 to-red-600'
                                            }
                                        ].map((item, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.1 * idx }}
                                                className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                                                        <item.icon className="w-7 h-7 text-white" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-xs font-black text-gray-400">STEP {item.step}</span>
                                                        </div>
                                                        <h3 className="text-lg font-black text-white mb-2">{item.title}</h3>
                                                        <p className="text-sm text-gray-400">{item.desc}</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Check Status Button */}
                                    <div className="flex flex-col items-center gap-4 pt-6">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={handleCheckStatus}
                                            disabled={isChecking}
                                            className="px-10 py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl font-black text-white shadow-2xl shadow-green-500/50 hover:shadow-green-500/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isChecking ? (
                                                    <>
                                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                                        <span>Checking...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle className="w-5 h-5" />
                                                        <span>Check Sync Status</span>
                                                    </>
                                                )}
                                            </div>
                                        </motion.button>

                                        {companies.length === 0 && !isChecking && (
                                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 max-w-md">
                                                <p className="text-sm text-amber-400 text-center">
                                                    <span className="font-bold">Waiting for first sync...</span> Make sure the Windows app is running
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {/* Step 3: Success */}
                            {currentStep === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="text-center space-y-8"
                                >
                                    {/* Success Animation */}
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-2xl shadow-green-500/50 mb-6"
                                    >
                                        <CheckCircle className="w-16 h-16 text-white" />
                                    </motion.div>

                                    <div>
                                        <h2 className="text-4xl font-black text-white mb-4">
                                            🎉 Setup Complete!
                                        </h2>
                                        <p className="text-xl text-gray-400 mb-8">
                                            Your Tally data is now synced to the cloud
                                        </p>
                                    </div>

                                    {/* Feature Highlights */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                        {[
                                            { icon: FileText, label: 'View Reports', desc: 'Access all your reports' },
                                            { icon: Package, label: 'Manage Stock', desc: 'Track inventory live' },
                                            { icon: Receipt, label: 'Create Bills', desc: 'Generate invoices' }
                                        ].map((item, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.2 + idx * 0.1 }}
                                                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
                                            >
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                                    <item.icon className="w-6 h-6 text-white" />
                                                </div>
                                                <h3 className="font-bold text-white mb-1">{item.label}</h3>
                                                <p className="text-sm text-gray-400">{item.desc}</p>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={handleGoToBilling}
                                            className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl font-black text-white shadow-2xl shadow-purple-500/50 hover:shadow-purple-500/70 transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Receipt className="w-5 h-5" />
                                                <span>Create Invoice</span>
                                            </div>
                                        </motion.button>

                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={handleGoToDashboard}
                                            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl font-black text-white shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Play className="w-5 h-5" />
                                                <span>Go to Dashboard</span>
                                            </div>
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-12 text-center"
                >
                    <p className="text-sm text-gray-500">
                        Need help? <a href="#" className="text-blue-400 hover:text-blue-300 font-semibold">Contact Support</a>
                    </p>
                </motion.div>
            </div>
        </div>
    );
};

export default OnboardingPage;
