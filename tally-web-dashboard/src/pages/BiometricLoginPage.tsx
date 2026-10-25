import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Fingerprint,
  ScanFace,
  Smartphone,
  Monitor,
  Globe,
  Clock,
  KeyRound,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Download,
  RefreshCw,
  LogOut,
  LogOutIcon,
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CopyCheck,
  MapPin,
  CalendarDays,
  Mail,
  MessageSquare,
  QrCode,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  History,
  Settings,
  UserCheck,
  UserX,
} from 'lucide-react';
import { format, formatDistanceToNow, subHours, subMinutes, subDays, subMonths } from 'date-fns';

interface BiometricDevice {
  id: string;
  name: string;
  type: 'fingerprint' | 'face';
  addedDate: Date;
  lastUsed: Date;
}

interface Session {
  id: string;
  deviceName: string;
  os: string;
  browser: string;
  ipAddress: string;
  lastActive: Date;
  location: string;
  isCurrent: boolean;
}

interface LoginRecord {
  id: string;
  dateTime: Date;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  status: 'success' | 'failed';
}

type TwoFactorMethod = 'authenticator' | 'sms' | 'email';
type TwoFactorStep = 'choose' | 'qr' | 'verify' | 'backup';

const mockBiometricDevices: BiometricDevice[] = [
  { id: 'bio-1', name: 'Right Thumb', type: 'fingerprint', addedDate: subDays(new Date(), 45), lastUsed: subMinutes(new Date(), 12) },
  { id: 'bio-2', name: 'Face ID - Primary', type: 'face', addedDate: subDays(new Date(), 30), lastUsed: subHours(new Date(), 2) },
  { id: 'bio-3', name: 'Left Index', type: 'fingerprint', addedDate: subDays(new Date(), 15), lastUsed: subDays(new Date(), 3) },
];

const mockSessions: Session[] = [
  { id: 'sess-1', deviceName: 'MacBook Pro', os: 'macOS 14.2', browser: 'Chrome 120', ipAddress: '192.168.1.45', lastActive: new Date(), location: 'Mumbai, India', isCurrent: true },
  { id: 'sess-2', deviceName: 'iPhone 15 Pro', os: 'iOS 17.2', browser: 'Safari Mobile', ipAddress: '192.168.1.78', lastActive: subMinutes(new Date(), 15), location: 'Mumbai, India', isCurrent: false },
  { id: 'sess-3', deviceName: 'Windows Desktop', os: 'Windows 11', browser: 'Edge 120', ipAddress: '10.0.0.12', lastActive: subHours(new Date(), 5), location: 'Delhi, India', isCurrent: false },
  { id: 'sess-4', deviceName: 'iPad Air', os: 'iPadOS 17.1', browser: 'Safari', ipAddress: '172.16.0.5', lastActive: subDays(new Date(), 1), location: 'Bangalore, India', isCurrent: false },
  { id: 'sess-5', deviceName: 'Linux Workstation', os: 'Ubuntu 22.04', browser: 'Firefox 121', ipAddress: '10.0.1.33', lastActive: subDays(new Date(), 2), location: 'Hyderabad, India', isCurrent: false },
];

const mockLoginHistory: LoginRecord[] = [
  { id: 'log-1', dateTime: subMinutes(new Date(), 5), device: 'MacBook Pro', browser: 'Chrome 120', ipAddress: '192.168.1.45', location: 'Mumbai, India', status: 'success' },
  { id: 'log-2', dateTime: subHours(new Date(), 3), device: 'iPhone 15 Pro', browser: 'Safari Mobile', ipAddress: '192.168.1.78', location: 'Mumbai, India', status: 'success' },
  { id: 'log-3', dateTime: subHours(new Date(), 8), device: 'Windows Desktop', browser: 'Edge 120', ipAddress: '10.0.0.12', location: 'Delhi, India', status: 'failed' },
  { id: 'log-4', dateTime: subDays(new Date(), 1), device: 'MacBook Pro', browser: 'Chrome 120', ipAddress: '192.168.1.45', location: 'Mumbai, India', status: 'success' },
  { id: 'log-5', dateTime: subDays(new Date(), 1), device: 'Unknown Device', browser: 'Unknown', ipAddress: '45.67.89.101', location: 'Unknown, Unknown', status: 'failed' },
  { id: 'log-6', dateTime: subDays(new Date(), 2), device: 'iPad Air', browser: 'Safari', ipAddress: '172.16.0.5', location: 'Bangalore, India', status: 'success' },
  { id: 'log-7', dateTime: subDays(new Date(), 3), device: 'Linux Workstation', browser: 'Firefox 121', ipAddress: '10.0.1.33', location: 'Hyderabad, India', status: 'success' },
  { id: 'log-8', dateTime: subDays(new Date(), 4), device: 'Windows Desktop', browser: 'Chrome 120', ipAddress: '10.0.0.12', location: 'Delhi, India', status: 'failed' },
  { id: 'log-9', dateTime: subDays(new Date(), 5), device: 'MacBook Pro', browser: 'Chrome 120', ipAddress: '192.168.1.45', location: 'Mumbai, India', status: 'success' },
  { id: 'log-10', dateTime: subDays(new Date(), 7), device: 'Unknown Device', browser: 'Unknown', ipAddress: '98.76.54.32', location: 'Unknown, Unknown', status: 'failed' },
];

const passwordHistory = [
  { changedAt: subMonths(new Date(), 2), strength: 'strong' as const },
  { changedAt: subMonths(new Date(), 5), strength: 'medium' as const },
  { changedAt: subMonths(new Date(), 8), strength: 'weak' as const },
];

const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; icon?: React.ReactNode }> = ({ children, className = '', title, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
    className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 sm:p-6 ${className}`}
  >
    {(title || icon) && (
      <div className="flex items-center gap-2.5 mb-5">
        {icon && <span className="text-cyan-400">{icon}</span>}
        {title && <h3 className="text-zinc-100 font-semibold text-lg">{title}</h3>}
      </div>
    )}
    {children}
  </motion.div>
);

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void; disabled?: boolean }> = ({ enabled, onToggle, disabled = false }) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
      enabled ? 'bg-cyan-500' : 'bg-zinc-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const Badge: React.FC<{ label: string; color: 'green' | 'red' | 'yellow' | 'blue' | 'cyan' }> = ({ label, color }) => {
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    yellow: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>
      {label}
    </span>
  );
};

const StrengthBar: React.FC<{ strength: 'weak' | 'medium' | 'strong' | 'very-strong' }> = ({ strength }) => {
  const config = {
    weak: { segments: 1, color: 'bg-red-500', label: 'Weak' },
    medium: { segments: 2, color: 'bg-amber-500', label: 'Medium' },
    strong: { segments: 3, color: 'bg-emerald-500', label: 'Strong' },
    'very-strong': { segments: 4, color: 'bg-cyan-400', label: 'Very Strong' },
  };
  const { segments, color, label } = config[strength];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= segments ? color : 'bg-zinc-700'}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${
        strength === 'weak' ? 'text-red-400' :
        strength === 'medium' ? 'text-amber-400' :
        strength === 'strong' ? 'text-emerald-400' : 'text-cyan-400'
      }`}>
        {label}
      </span>
    </div>
  );
};

const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning';
}> = ({ open, title, message, onConfirm, onCancel, variant = 'danger' }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-3">
            {variant === 'danger' ? (
              <div className="p-2 bg-red-500/20 rounded-lg">
                <ShieldX className="w-5 h-5 text-red-400" />
              </div>
            ) : (
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
            )}
            <h4 className="text-zinc-100 font-semibold">{title}</h4>
          </div>
          <p className="text-zinc-400 text-sm mb-5">{message}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              Confirm
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const SecurityScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;
  const getColor = () => {
    if (score >= 80) return 'stroke-emerald-400';
    if (score >= 60) return 'stroke-amber-400';
    return 'stroke-red-400';
  };
  const getLabel = () => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };
  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(63 63 70 / 0.5)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          className={getColor()}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-zinc-100">{score}</span>
        <span className={`text-xs font-medium ${
          score >= 80 ? 'text-emerald-400' :
          score >= 60 ? 'text-amber-400' : 'text-red-400'
        }`}>
          {getLabel()}
        </span>
      </div>
    </div>
  );
};

export default function BiometricLoginPage() {
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [activeSessions, setActiveSessions] = useState(mockSessions);
  const [lastPasswordChange] = useState(subDays(new Date(), 18));
  const [securityScore, setSecurityScore] = useState(72);
  const [loginHistory] = useState(mockLoginHistory);

  const [biometricDevices, setBiometricDevices] = useState(mockBiometricDevices);
  const [showRemoveBiometric, setShowRemoveBiometric] = useState<string | null>(null);
  const [biometricSupported] = useState(true);

  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>('authenticator');
  const [twoFactorStep, setTwoFactorStep] = useState<TwoFactorStep>('choose');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes] = useState(() => {
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(`${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
    }
    return codes;
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState(15);

  const [showLoginHistory, setShowLoginHistory] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showLogoutAll, setShowLogoutAll] = useState(false);
  const [showRemoveSession, setShowRemoveSession] = useState<string | null>(null);

  const getPasswordStrength = useCallback((pwd: string): 'weak' | 'medium' | 'strong' | 'very-strong' => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z\d]/.test(pwd)) score++;
    if (score <= 1) return 'weak';
    if (score <= 2) return 'medium';
    if (score <= 3) return 'strong';
    return 'very-strong';
  }, []);

  const passwordStrength = getPasswordStrength(newPassword);

  const passwordRequirements = [
    { met: newPassword.length >= 8, label: 'At least 8 characters' },
    { met: /[a-z]/.test(newPassword), label: 'Contains lowercase letter' },
    { met: /[A-Z]/.test(newPassword), label: 'Contains uppercase letter' },
    { met: /\d/.test(newPassword), label: 'Contains a number' },
    { met: /[^a-zA-Z\d]/.test(newPassword), label: 'Contains special character' },
    { met: newPassword === confirmPassword && confirmPassword.length > 0, label: 'Passwords match' },
  ];

  const allRequirementsMet = passwordRequirements.every((r) => r.met);

  const handleAddBiometric = () => {
    const newDevice: BiometricDevice = {
      id: `bio-${Date.now()}`,
      name: biometricDevices.length % 2 === 0 ? 'Right Index' : 'Face ID - Secondary',
      type: biometricDevices.length % 2 === 0 ? 'fingerprint' : 'face',
      addedDate: new Date(),
      lastUsed: new Date(),
    };
    setBiometricDevices([...biometricDevices, newDevice]);
    toast.success('Biometric device registered successfully');
    setSecurityScore(Math.min(100, securityScore + 5));
  };

  const handleRemoveBiometric = (id: string) => {
    setBiometricDevices(biometricDevices.filter((d) => d.id !== id));
    setShowRemoveBiometric(null);
    toast.success('Biometric device removed');
    setSecurityScore(Math.max(0, securityScore - 3));
  };

  const handleToggleBiometric = () => {
    const newState = !biometricEnabled;
    setBiometricEnabled(newState);
    toast.success(newState ? 'Biometric authentication enabled' : 'Biometric authentication disabled');
    setSecurityScore(newState ? securityScore + 3 : securityScore - 3);
  };

  const handleToggle2FA = () => {
    if (twoFactorEnabled) {
      setTwoFactorEnabled(false);
      setTwoFactorStep('choose');
      toast.success('Two-factor authentication disabled');
      setSecurityScore(securityScore - 10);
    } else {
      setTwoFactorStep('choose');
    }
  };

  const handle2FASetup = () => {
    setTwoFactorEnabled(true);
    setTwoFactorStep('choose');
    toast.success('Two-factor authentication enabled');
    setSecurityScore(Math.min(100, securityScore + 10));
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast.success('Code copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleCopyAllBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      toast.success('All backup codes copied');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleDownloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  const handleLogoutSession = (id: string) => {
    setActiveSessions(activeSessions.filter((s) => s.id !== id));
    setShowRemoveSession(null);
    toast.success('Session terminated');
  };

  const handleLogoutAll = () => {
    setActiveSessions(activeSessions.filter((s) => s.isCurrent));
    setShowLogoutAll(false);
    toast.success('All other sessions terminated');
  };

  const handleChangePassword = () => {
    if (!allRequirementsMet) {
      toast.error('Please meet all password requirements');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Password changed successfully');
    setSecurityScore(Math.min(100, securityScore + 5));
  };

  const handleExportLoginHistory = () => {
    const csv = [
      'DateTime,Device,Browser,IP Address,Location,Status',
      ...loginHistory.map(
        (l) => `${format(l.dateTime, 'yyyy-MM-dd HH:mm:ss')},${l.device},${l.browser},${l.ipAddress},${l.location},${l.status}`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'login-history.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Login history exported');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100">Security Settings</h1>
            <p className="text-zinc-500 text-sm mt-1">Manage your account security and authentication methods</p>
          </div>
          <Badge label={twoFactorEnabled ? 'Fully Secured' : 'Partially Secured'} color={twoFactorEnabled ? 'green' : 'yellow'} />
        </div>

        {/* Security Dashboard Overview */}
        <Card title="Security Overview" icon={<ShieldCheck className="w-5 h-5" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <div className={`p-2 rounded-lg ${biometricEnabled ? 'bg-emerald-500/20' : 'bg-zinc-700/50'}`}>
                {biometricEnabled ? <Fingerprint className="w-5 h-5 text-emerald-400" /> : <Fingerprint className="w-5 h-5 text-zinc-500" />}
              </div>
              <span className="text-xs text-zinc-500 text-center">Biometric</span>
              <span className={`text-sm font-semibold ${biometricEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {biometricEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <div className={`p-2 rounded-lg ${twoFactorEnabled ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                {twoFactorEnabled ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}
              </div>
              <span className="text-xs text-zinc-500 text-center">2FA</span>
              <span className={`text-sm font-semibold ${twoFactorEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                {twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <Monitor className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-xs text-zinc-500 text-center">Active Sessions</span>
              <span className="text-sm font-semibold text-cyan-400">{activeSessions.length}</span>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-zinc-700/50">
                <KeyRound className="w-5 h-5 text-zinc-400" />
              </div>
              <span className="text-xs text-zinc-500 text-center">Last Password</span>
              <span className="text-sm font-semibold text-zinc-300">{formatDistanceToNow(lastPasswordChange, { addSuffix: false })} ago</span>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <SecurityScoreGauge score={securityScore} />
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <History className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-xs text-zinc-500 text-center">Total Logins</span>
              <span className="text-sm font-semibold text-blue-400">{loginHistory.length}</span>
            </div>
          </div>
        </Card>

        {/* Biometric Authentication */}
        <Card title="Biometric Authentication" icon={<Fingerprint className="w-5 h-5" />}>
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                {biometricEnabled ? (
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Fingerprint className="w-5 h-5 text-emerald-400" />
                  </div>
                ) : (
                  <div className="p-2 bg-zinc-700/50 rounded-lg">
                    <Fingerprint className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-zinc-200">Biometric Login</span>
                  <p className="text-xs text-zinc-500">Use fingerprint or face recognition to sign in</p>
                </div>
              </div>
              <Toggle enabled={biometricEnabled} onToggle={handleToggleBiometric} />
            </div>

            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              biometricSupported ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {biometricSupported ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>
                {biometricSupported
                  ? 'Your device supports biometric authentication'
                  : 'Biometric authentication is not available on this device'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">Registered Biometrics ({biometricDevices.length})</span>
                <button
                  onClick={handleAddBiometric}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New
                </button>
              </div>

              <div className="space-y-2">
                {biometricDevices.map((device) => (
                  <motion.div
                    key={device.id}
                    layout
                    className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {device.type === 'fingerprint' ? (
                        <div className="p-2 bg-cyan-500/10 rounded-lg">
                          <Fingerprint className="w-4 h-4 text-cyan-400" />
                        </div>
                      ) : (
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <ScanFace className="w-4 h-4 text-blue-400" />
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-zinc-200">{device.name}</span>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-zinc-500">
                            Added {format(device.addedDate, 'MMM d, yyyy')}
                          </span>
                          <span className="text-xs text-zinc-600">{'\u2022'}</span>
                          <span className="text-xs text-zinc-500">
                            Used {formatDistanceToNow(device.lastUsed, { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowRemoveBiometric(device.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-500">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>If biometric authentication fails, you will be prompted to enter your PIN as a fallback</span>
            </div>
          </div>
        </Card>

        {/* Two-Factor Authentication */}
        <Card title="Two-Factor Authentication" icon={<ShieldCheck className="w-5 h-5" />}>
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                {twoFactorEnabled ? (
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                ) : (
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-zinc-200">Two-Factor Authentication</span>
                  <p className="text-xs text-zinc-500">Add an extra layer of security to your account</p>
                </div>
              </div>
              <Toggle enabled={twoFactorEnabled} onToggle={handleToggle2FA} />
            </div>

            {!twoFactorEnabled && (
              <div className="space-y-4">
                <AnimatePresence mode="wait">
                  {twoFactorStep === 'choose' && (
                    <motion.div
                      key="choose"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-3"
                    >
                      <h4 className="text-sm font-medium text-zinc-300">Choose your 2FA method</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { id: 'authenticator' as const, icon: <Smartphone className="w-5 h-5" />, label: 'Authenticator App', desc: 'Google Authenticator, Authy, etc.' },
                          { id: 'sms' as const, icon: <MessageSquare className="w-5 h-5" />, label: 'SMS', desc: 'Receive code via text message' },
                          { id: 'email' as const, icon: <Mail className="w-5 h-5" />, label: 'Email', desc: 'Receive code via email' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setTwoFactorMethod(m.id); setTwoFactorStep('qr'); }}
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                              twoFactorMethod === m.id
                                ? 'border-cyan-500/50 bg-cyan-500/10'
                                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${twoFactorMethod === m.id ? 'bg-cyan-500/20' : 'bg-zinc-700/50'}`}>
                              {m.icon}
                            </div>
                            <span className="text-sm font-medium text-zinc-200">{m.label}</span>
                            <span className="text-xs text-zinc-500 text-center">{m.desc}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {twoFactorStep === 'qr' && (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTwoFactorStep('choose')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h4 className="text-sm font-medium text-zinc-300">
                          {twoFactorMethod === 'authenticator' ? 'Scan QR Code' : twoFactorMethod === 'sms' ? 'Verify Phone Number' : 'Verify Email Address'}
                        </h4>
                      </div>

                      {twoFactorMethod === 'authenticator' && (
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-48 h-48 bg-white rounded-xl p-3 flex items-center justify-center">
                            <div className="w-full h-full grid grid-cols-9 grid-rows-9 gap-px">
                              {Array.from({ length: 81 }).map((_, i) => {
                                const row = Math.floor(i / 9);
                                const col = i % 9;
                                const isCorner = (row < 3 && col < 3) || (row < 3 && col > 5) || (row > 5 && col < 3);
                                const isPattern = isCorner || (row === 4 && col === 4) || ((row + col) % 3 === 0);
                                return (
                                  <div key={i} className={`rounded-sm ${isPattern ? 'bg-zinc-900' : 'bg-zinc-100'}`} />
                                );
                              })}
                            </div>
                          </div>
                          <div className="text-center space-y-2">
                            <p className="text-sm text-zinc-400">Scan this QR code with your authenticator app</p>
                            <p className="text-xs text-zinc-500">Or enter this code manually:</p>
                            <code className="block px-3 py-2 bg-zinc-800 rounded-lg text-sm text-cyan-400 font-mono select-all">
                              JBSWY3DPEHPK3PXP
                            </code>
                          </div>
                        </div>
                      )}

                      {twoFactorMethod !== 'authenticator' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg">
                            {twoFactorMethod === 'sms' ? <Smartphone className="w-4 h-4 text-zinc-400" /> : <Mail className="w-4 h-4 text-zinc-400" />}
                            <span className="text-sm text-zinc-300">
                              {twoFactorMethod === 'sms' ? '+91 98*** ***78' : 'us***@gmail.com'}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            A verification code will be sent to your {twoFactorMethod === 'sms' ? 'phone' : 'email'}
                          </p>
                        </div>
                      )}

                      <button
                        onClick={() => setTwoFactorStep('verify')}
                        className="w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Continue
                      </button>
                    </motion.div>
                  )}

                  {twoFactorStep === 'verify' && (
                    <motion.div
                      key="verify"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTwoFactorStep('qr')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h4 className="text-sm font-medium text-zinc-300">Enter Verification Code</h4>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Enter the 6-digit code from your {twoFactorMethod === 'authenticator' ? 'authenticator app' : twoFactorMethod}
                      </p>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full max-w-xs px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-center text-2xl font-mono text-zinc-100 tracking-[0.5em] placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                        maxLength={6}
                      />
                      <button
                        onClick={() => {
                          if (verificationCode.length === 6) {
                            setTwoFactorStep('backup');
                          } else {
                            toast.error('Please enter a 6-digit code');
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Verify Code
                      </button>
                    </motion.div>
                  )}

                  {twoFactorStep === 'backup' && (
                    <motion.div
                      key="backup"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTwoFactorStep('verify')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h4 className="text-sm font-medium text-zinc-300">Backup Codes</h4>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {backupCodes.map((code, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-3 py-2 bg-zinc-800 rounded-lg group"
                          >
                            <code className="text-sm text-zinc-300 font-mono">{code}</code>
                            <button
                              onClick={() => handleCopyCode(code)}
                              className="text-zinc-600 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleCopyAllBackupCodes}
                          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                        >
                          <CopyCheck className="w-4 h-4" />
                          Copy All
                        </button>
                        <button
                          onClick={handleDownloadBackupCodes}
                          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handle2FASetup}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Enable 2FA
                        </button>
                        <button
                          onClick={() => setTwoFactorStep('choose')}
                          className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {twoFactorEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-lg text-sm text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Two-factor authentication is active</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { toast.success('Backup codes regenerated'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate Backup Codes
                  </button>
                  <button
                    onClick={() => { toast.success('Recovery options updated'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    <Smartphone className="w-4 h-4" />
                    Recovery Options
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Session Management */}
        <Card title="Active Sessions" icon={<Monitor className="w-5 h-5" />}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-zinc-500">{activeSessions.length} active session{activeSessions.length !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAutoLockTimeout(autoLockTimeout)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Timeout: {autoLockTimeout}min
                </button>
                <button
                  onClick={() => setShowLogoutAll(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout All Others
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {activeSessions.map((session) => (
                <motion.div
                  key={session.id}
                  layout
                  className={`bg-zinc-800/50 rounded-lg overflow-hidden ${
                    session.isCurrent ? 'border border-cyan-500/30' : ''
                  }`}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${session.isCurrent ? 'bg-cyan-500/20' : 'bg-zinc-700/50'}`}>
                        {session.os.includes('iOS') || session.os.includes('iPad') ? (
                          <Smartphone className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <Monitor className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200">{session.deviceName}</span>
                          {session.isCurrent && <Badge label="Current" color="cyan" />}
                        </div>
                        <span className="text-xs text-zinc-500">
                          {session.os} {'\u2022'} {session.browser} {'\u2022'} {formatDistanceToNow(session.lastActive, { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!session.isCurrent && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowRemoveSession(session.id); }}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <LogOutIcon className="w-4 h-4" />
                        </button>
                      )}
                      {expandedSession === session.id ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedSession === session.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 pt-1 border-t border-zinc-800">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-zinc-500">IP Address</span>
                              <p className="text-zinc-300 font-mono">{session.ipAddress}</p>
                            </div>
                            <div>
                              <span className="text-zinc-500">Location</span>
                              <p className="text-zinc-300 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {session.location}
                              </p>
                            </div>
                            <div>
                              <span className="text-zinc-500">Last Active</span>
                              <p className="text-zinc-300">{format(session.lastActive, 'MMM d, HH:mm')}</p>
                            </div>
                            <div>
                              <span className="text-zinc-500">Session ID</span>
                              <p className="text-zinc-300 font-mono">{session.id}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-300">Auto-Lock Timeout</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 5, 15, 30].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => {
                      setAutoLockTimeout(minutes);
                      toast.success(`Auto-lock set to ${minutes} minute${minutes !== 1 ? 's' : ''}`);
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      autoLockTimeout === minutes
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Password Settings */}
        <Card title="Password Settings" icon={<KeyRound className="w-5 h-5" />}>
          <div className="space-y-5">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-zinc-300">Change Password</h4>

              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-4 py-2.5 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-4 py-2.5 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {newPassword && (
              <div className="space-y-3">
                <StrengthBar strength={passwordStrength} />
                <div className="space-y-1.5">
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {req.met ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                      )}
                      <span className={req.met ? 'text-emerald-400' : 'text-zinc-500'}>{req.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleChangePassword}
              disabled={!allRequirementsMet || !currentPassword}
              className="w-full sm:w-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Password
            </button>

            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <h4 className="text-sm font-medium text-zinc-300">Password History</h4>
              <p className="text-xs text-zinc-500">You cannot reuse any of your last 3 passwords</p>
              <div className="space-y-2">
                {passwordHistory.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-400">Changed {format(entry.changedAt, 'MMM d, yyyy')}</span>
                    </div>
                    <Badge
                      label={entry.strength === 'weak' ? 'Weak' : entry.strength === 'medium' ? 'Medium' : 'Strong'}
                      color={entry.strength === 'weak' ? 'red' : entry.strength === 'medium' ? 'yellow' : 'green'}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Login History */}
        <Card title="Login History" icon={<History className="w-5 h-5" />}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLoginHistory(!showLoginHistory)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  {showLoginHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showLoginHistory ? 'Hide History' : 'Show History'}
                </button>
              </div>
              <button
                onClick={handleExportLoginHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            {/* Geographic Map Placeholder */}
            <div className="bg-zinc-800/50 rounded-lg p-6 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Globe className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-sm text-zinc-500">Geographic Login Map</p>
                <p className="text-xs text-zinc-600">Login locations will be displayed on a map here</p>
                <div className="flex justify-center gap-2 mt-3">
                  {['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad'].map((city) => (
                    <div key={city} className="flex items-center gap-1 px-2 py-1 bg-zinc-700/50 rounded text-xs text-zinc-400">
                      <MapPin className="w-3 h-3" />
                      {city}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showLoginHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Date/Time</th>
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Device</th>
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Browser</th>
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">IP Address</th>
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">Location</th>
                          <th className="text-left py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {loginHistory.map((record) => (
                          <tr
                            key={record.id}
                            className={`${
                              record.status === 'failed' ? 'bg-red-500/5' : 'hover:bg-zinc-800/30'
                            } transition-colors`}
                          >
                            <td className="py-3 px-3 text-zinc-300 whitespace-nowrap">
                              {format(record.dateTime, 'MMM d, HH:mm')}
                            </td>
                            <td className="py-3 px-3 text-zinc-300 whitespace-nowrap">{record.device}</td>
                            <td className="py-3 px-3 text-zinc-400 whitespace-nowrap hidden sm:table-cell">{record.browser}</td>
                            <td className="py-3 px-3 text-zinc-400 font-mono text-xs whitespace-nowrap hidden md:table-cell">{record.ipAddress}</td>
                            <td className="py-3 px-3 text-zinc-400 whitespace-nowrap hidden lg:table-cell">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {record.location}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {record.status === 'success' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Success
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                                  <XCircle className="w-3.5 h-3.5" />
                                  Failed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>

      {/* Confirm Modals */}
      <ConfirmModal
        open={!!showRemoveBiometric}
        title="Remove Biometric Device"
        message="Are you sure you want to remove this biometric device? You will need to re-register it to use biometric login."
        onConfirm={() => showRemoveBiometric && handleRemoveBiometric(showRemoveBiometric)}
        onCancel={() => setShowRemoveBiometric(null)}
        variant="danger"
      />

      <ConfirmModal
        open={showLogoutAll}
        title="Logout All Other Sessions"
        message="This will terminate all other active sessions. You will remain logged in on this device."
        onConfirm={handleLogoutAll}
        onCancel={() => setShowLogoutAll(false)}
        variant="warning"
      />

      <ConfirmModal
        open={!!showRemoveSession}
        title="Terminate Session"
        message="Are you sure you want to terminate this session? The user will be logged out immediately."
        onConfirm={() => showRemoveSession && handleLogoutSession(showRemoveSession)}
        onCancel={() => setShowRemoveSession(null)}
        variant="danger"
      />
    </div>
  );
}
