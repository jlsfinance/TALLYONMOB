import React, { useState, useEffect, useRef } from 'react';
import { CompanyProfile, InvoiceFormat } from '../types';
import { StorageService } from '../services/storageService';
import { AIService } from '../services/aiService';
import { ChevronRight, User, Building2, Cloud, Database, Sparkles, Shield, Trash2, Download, Upload, Briefcase } from 'lucide-react';
import { FirebaseService } from '../services/firebaseService';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAI } from '@/contexts/AIContext';
import PrivacyModal from '../modules/accounting/pages/PrivacyModal';
import TermsModal from '../modules/accounting/pages/TermsModal';
import RefundModal from '../modules/accounting/pages/RefundModal';
import { InputModal } from '@/components/InputModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { AlertModal } from '@/components/AlertModal';
import { NotificationService } from '../services/notificationService';

import { FeedbackModal } from './FeedbackModal';
import { DigitalCardGenerator } from './DigitalCardGenerator';

const Settings: React.FC = () => {
  const { company, saveCompany } = useCompany();
  const { user, deleteAccount } = useAuth();
  const { refreshConfig } = useAI();

  const [profile, setProfile] = useState<CompanyProfile>({
    name: '',
    address: '',
    phone: '',
    email: '',
    upiId: ''
  });

  const [gstEnabled, setGstEnabled] = useState(company?.gst_enabled ?? true);
  const [gstNumber, setGstNumber] = useState(company?.gst ?? '');
  const [roundUpDefault, setRoundUpDefault] = useState<0 | 10 | 100>(company?.roundUpDefault ?? 0);
  const [invoiceTemplate, setInvoiceTemplate] = useState(company?.invoiceSettings?.format || (company?.invoiceTemplate?.toUpperCase() as any) || InvoiceFormat.DEFAULT);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [isGeminiConfigured, setIsGeminiConfigured] = useState(false);
  const [invoiceLanguage, setInvoiceLanguage] = useState<'English' | 'Hindi' | 'Hinglish'>(company?.invoiceSettings?.language || 'English');
  const [invoicePrefix, setInvoicePrefix] = useState(company?.invoiceSettings?.invoicePrefix || '');
  const [invoiceSuffix, setInvoiceSuffix] = useState(company?.invoiceSettings?.invoiceSuffix || '');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(company?.invoiceSettings?.nextInvoiceNumber?.toString() || '');

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showCardGenerator, setShowCardGenerator] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Modal States
  const [pendingRestoreContent, setPendingRestoreContent] = useState<string | null>(null);
  const [pendingRemoveUserEmail, setPendingRemoveUserEmail] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'success' | 'danger' | 'info' | 'warning' } | null>(null);

  const showAlert = (title: string, message: string, variant: 'success' | 'danger' | 'info' | 'warning' = 'info') => {
    setAlertConfig({ isOpen: true, title, message, variant });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (company) {
      setProfile({
        name: company.name || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        upiId: company.upiId || ''
      });
      setGstEnabled(company.gst_enabled ?? true);
      setGstNumber(company.gst || '');
      setRoundUpDefault(company.roundUpDefault ?? 0);
      setInvoiceTemplate(company.invoiceSettings?.format || (company.invoiceTemplate?.toUpperCase() as any) || InvoiceFormat.DEFAULT);
      setInvoicePrefix(company.invoiceSettings?.invoicePrefix || '');
      setInvoiceSuffix(company.invoiceSettings?.invoiceSuffix || '');
      setNextInvoiceNumber(company.invoiceSettings?.nextInvoiceNumber?.toString() || '');
    } else {
      const currentProfile = StorageService.getCompanyProfile();
      setProfile(currentProfile);
      setInvoicePrefix(currentProfile.invoiceSettings?.invoicePrefix || '');
      setInvoiceSuffix(currentProfile.invoiceSettings?.invoiceSuffix || '');
      setNextInvoiceNumber(currentProfile.invoiceSettings?.nextInvoiceNumber?.toString() || '');
    }

    setIsFirebaseReady(FirebaseService.isReady());
    setIsGeminiConfigured(AIService.isConfigured());
    setApiKeyInput(AIService.getApiKey() || '');
    setInvoiceLanguage(company?.invoiceSettings?.language || 'English');
  }, [company]);

  const handleSaveProfile = async () => {
    try {
      if (!company) {
        // Fallback to local storage if not logged in (legacy)
        StorageService.saveCompanyProfile(profile);
        showAlert('Success', 'Local profile updated!', 'success');
        return;
      }

      await saveCompany({
        name: profile.name,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        upiId: profile.upiId,
        gst: gstNumber,
        gst_enabled: gstEnabled,
        roundUpDefault: roundUpDefault,
        invoiceTemplate: invoiceTemplate as any,
        invoiceSettings: {
          ...company.invoiceSettings,
          format: invoiceTemplate as InvoiceFormat,
          invoicePrefix,
          invoiceSuffix,
          nextInvoiceNumber: nextInvoiceNumber ? parseInt(nextInvoiceNumber) : undefined
        }
      });

      // SYNC: Update Local Storage & Notification too
      StorageService.saveCompanyProfile({
        ...company, // preserve existing fields
        name: profile.name,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        upiId: profile.upiId,
        gst: gstNumber,
        gst_enabled: gstEnabled
      } as CompanyProfile);

      await NotificationService.scheduleDailyNotification();

      showAlert('Success', 'Profile saved successfully!', 'success');
      setShowProfileEditor(false);
    } catch (error) {
      console.error("Save error:", error);
      showAlert('Error', 'Failed to save settings.', 'danger');
    }
  };

  const handleSaveInvoiceSettings = async () => {
    try {
      if (!company) {
        // Local save
        const current = StorageService.getCompanyProfile();
        StorageService.saveCompanyProfile({
          ...current,
          invoiceSettings: {
            ...current.invoiceSettings,
            invoicePrefix,
            invoiceSuffix,
            nextInvoiceNumber: nextInvoiceNumber ? parseInt(nextInvoiceNumber) : undefined,
            format: current.invoiceSettings?.format || InvoiceFormat.DEFAULT // ensure format exists
          }
        });
        showAlert('Success', 'Invoice settings saved locally!', 'success');
        return;
      }

      await saveCompany({
        invoiceSettings: {
          ...company.invoiceSettings,
          invoicePrefix,
          invoiceSuffix,
          nextInvoiceNumber: nextInvoiceNumber ? parseInt(nextInvoiceNumber) : undefined,
          format: company.invoiceSettings?.format || InvoiceFormat.DEFAULT
        }
      });
      showAlert('Success', 'Invoice numbering updated!', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to save invoice settings', 'danger');
    }
  };

  const handleSaveTemplate = async (newTemplate: InvoiceFormat) => {
    try {
      if (!company) return;

      setInvoiceTemplate(newTemplate);

      await saveCompany({
        invoiceTemplate: newTemplate as any,
        invoiceSettings: {
          ...company.invoiceSettings,
          format: newTemplate,
          language: invoiceLanguage
        }
      });

      console.log('✅ Template saved:', newTemplate);
    } catch (error) {
      console.error("Template save error:", error);
    }
  };

  const handleSaveLanguage = async (newLang: 'English' | 'Hindi' | 'Hinglish') => {
    try {
      if (!company) return;

      setInvoiceLanguage(newLang);

      await saveCompany({
        invoiceSettings: {
          ...company.invoiceSettings,
          format: invoiceTemplate as InvoiceFormat,
          language: newLang
        }
      });

      console.log('✅ Language saved:', newLang);
    } catch (error) {
      console.error("Language save error:", error);
    }
  };

  const handleDownloadBackup = () => {
    const dataStr = StorageService.exportAllData();
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `billbook_backup_${new Date().toISOString().slice(0, 10)}.json`);
    linkElement.click();
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        setPendingRestoreContent(content);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingRestoreContent) return;
    try {
      const result = await StorageService.importData(pendingRestoreContent);
      if (result.success) {
        showAlert('Success', result.message, 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showAlert('Error', result.message, 'danger');
      }
    } catch (err: any) {
      showAlert('Error', err.message, 'danger');
    }
    setPendingRestoreContent(null);
  };

  const handleDeleteAccount = async () => {
    setShowDeleteModal(true);
  };

  const SettingsItem = ({ icon: Icon, title, subtitle, onClick, badge, last }: any) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!last && 'border-b border-slate-100 dark:border-slate-800'}`}
    >
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      {badge && (
        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full">{badge}</span>
      )}
      <ChevronRight className="w-5 h-5 text-slate-400" />
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-4 pt-safe pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-black text-slate-800 dark:text-white">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">Manage your business preferences</p>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">

        {/* Profile Card */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-black">
              {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black truncate">{user?.displayName || 'User'}</p>
              <p className="text-sm opacity-90 truncate">{user?.email}</p>
            </div>
          </div>
        </div>





        {/* Business Section */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Business</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <SettingsItem
              icon={Building2}
              title="Company Profile"
              subtitle={profile.name || "Set up your business details"}
              onClick={() => setShowProfileEditor(true)}
            />
            <SettingsItem
              icon={Briefcase}
              title="Digital Business Card"
              subtitle="Share your visiting card"
              badge="NEW"
              onClick={() => setShowCardGenerator(true)}
            />
            <SettingsItem
              icon={Database}
              title="Backup & Restore"
              subtitle="Manage your data safely"
              onClick={() => {
                const choice = window.confirm("Choose Action:\nOK - Download Backup (Export)\nCancel - Restore Backup (Import)");
                if (choice) {
                  handleDownloadBackup();
                } else {
                  // A bit hacky with window.confirm, better to use a state for a modal.
                  // Let's use a simple state to show a modal or just trigger import if they cancel? No that's confusing.
                  // Let's open a custom modal.
                  setShowBackupModal(true);
                }
              }}
            />
            <SettingsItem
              icon={Sparkles}
              title="AI Settings"
              subtitle={isGeminiConfigured ? "AI features active" : "Configure API Key"}
              badge={isGeminiConfigured ? "Active" : "Setup Needed"}
              onClick={() => setShowAiConfig(true)}
              last
            />
          </div>
        </div>

        {/* Invoice Templates Section - Horizontal Scroll */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Invoice Style</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Choose Template</h3>
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar snap-x">
              {[
                { id: InvoiceFormat.DEFAULT, name: 'Default', emoji: '📄' },
                { id: InvoiceFormat.MODERN, name: 'Modern', emoji: '✨' },
                { id: InvoiceFormat.MINIMAL, name: 'Minimal', emoji: '⚪' },
                { id: InvoiceFormat.DESI_BILL_BOOK, name: 'Desi', emoji: '🏪' },
                { id: InvoiceFormat.KACCHI_BILL_BOOK, name: 'Kacchi', emoji: '📝' },
                { id: InvoiceFormat.TALLY_PRIME_STYLE, name: 'Tally', emoji: '🧮' },
                { id: InvoiceFormat.PROFESSIONAL, name: 'Pro', emoji: '📜' },
                { id: InvoiceFormat.ELEGANT, name: 'Elegant', emoji: '💎' },
                { id: InvoiceFormat.COMPACT, name: 'Compact', emoji: '📱' },
                { id: InvoiceFormat.RETRO, name: 'Retro', emoji: '🏛️' },
                { id: InvoiceFormat.SAVE_PAPER, name: 'Save Paper', emoji: '🌱' }
              ].map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSaveTemplate(template.id)}
                  className={`flex-shrink-0 w-24 p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 snap-start ${invoiceTemplate === template.id
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'
                    }`}
                >
                  <div className="text-2xl">{template.emoji}</div>
                  <div className="text-[10px] font-bold text-slate-800 dark:text-white truncate w-full text-center">{template.name}</div>
                  {invoiceTemplate === template.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest mb-6">Swipe to see more styles</p>

            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 border-t border-slate-100 dark:border-slate-800 pt-6">Print Language</h3>
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl">
              {['English', 'Hindi', 'Hinglish'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleSaveLanguage(lang as any)}
                  className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${invoiceLanguage === lang
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                    : 'text-slate-500'
                    }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-3 px-2 leading-relaxed">
              {invoiceLanguage === 'English'
                ? "Invoices will be printed in standard English."
                : `Powered by Gemini AI, invoice items and terms will be automatically translated to ${invoiceLanguage} during PDF generation.`}
            </p>

            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 border-t border-slate-100 dark:border-slate-800 pt-6">Invoice Numbering</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Prefix</label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value)}
                  placeholder="e.g. INV-"
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Start No.</label>
                <input
                  type="number"
                  value={nextInvoiceNumber}
                  onChange={(e) => setNextInvoiceNumber(e.target.value)}
                  placeholder="1"
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Suffix</label>
                <input
                  type="text"
                  value={invoiceSuffix}
                  onChange={(e) => setInvoiceSuffix(e.target.value)}
                  placeholder="e.g. /2024"
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500"
                />
              </div>
            </div>
            <button
              onClick={handleSaveInvoiceSettings}
              className="w-full py-3 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              Save Numbering Settings
            </button>
          </div>
        </div>

        {/* Cloud & AI Section */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Advanced</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <SettingsItem
              icon={Cloud}
              title="Cloud Sync"
              subtitle={isFirebaseReady ? "Connected" : "Setup Firebase"}
              badge={isFirebaseReady ? "ACTIVE" : undefined}
              onClick={() => setShowCloudConfig(true)}
            />
            <SettingsItem
              icon={Sparkles}
              title="AI Smart Import"
              subtitle={isGeminiConfigured ? "Gemini AI Configured" : "Setup Gemini API"}
              badge={isGeminiConfigured ? "READY" : undefined}
              onClick={() => setShowAiConfig(true)}
              last
            />
          </div>
        </div>

        {/* Legal Section */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Legal & Privacy</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <SettingsItem
              icon={Shield}
              title="Privacy Policy"
              subtitle="How we handle your data"
              onClick={() => setShowPrivacyModal(true)}
            />
            <SettingsItem
              icon={Shield}
              title="Terms of Use"
              subtitle="User agreement"
              onClick={() => setShowTermsModal(true)}
            />
            <SettingsItem
              icon={Shield}
              title="Refund Policy"
              subtitle="Cancellation & refunds"
              onClick={() => setShowRefundModal(true)}
              last
            />
          </div>
        </div>

        {/* Support Section */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Support</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <SettingsItem
              icon={Sparkles}
              title="Send Feedback"
              subtitle="Rate us & share suggestions"
              onClick={() => setShowFeedbackModal(true)}
              last
            />
          </div>
        </div>

        {/* User Access Section */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-slate-400 uppercase tracking-wider">Access Management</h2>
          <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <SettingsItem
              icon={User}
              title="Team & Permissions"
              subtitle={company && (company as any).allowed_emails?.length > 0
                ? `${(company as any).allowed_emails.length} users have access`
                : "Give other users access to this company"}
              onClick={() => {
                if (!company) return;
                setShowEmailModal(true);
              }}
              last
            />
            {company && (company as any).allowed_emails?.length > 0 && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Users with access:</p>
                <div className="flex flex-wrap gap-2">
                  {(company as any).allowed_emails.map((email: string) => (
                    <div key={email} className="px-3 py-1 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{email}</span>
                      <button
                        onClick={() => setPendingRemoveUserEmail(email)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div>
          <h2 className="px-4 mb-2 text-xs font-black text-red-400 uppercase tracking-wider">Danger Zone</h2>
          <div className="bg-red-50 dark:bg-red-900/10 rounded-3xl overflow-hidden border border-red-100 dark:border-red-900/30">
            <button
              onClick={handleDeleteAccount}
              className="w-full flex items-center gap-4 p-4 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-red-600">Delete Account</p>
                <p className="text-xs text-red-500">Permanently remove all data</p>
              </div>
              <ChevronRight className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Version Info */}
        <div className="text-center py-6 space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">JLS BillBook v2.4.0</p>
          <p className="text-xs text-slate-500">Play Store Verified & Compliant</p>
        </div>

      </div>

      {/* Profile Editor Modal */}
      {
        showProfileEditor && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-black">Company Profile</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">Address</label>
                  <textarea
                    rows={3}
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Phone</label>
                    <input
                      type="text"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">UPI ID</label>
                  <input
                    type="text"
                    value={profile.upiId}
                    onChange={(e) => setProfile({ ...profile, upiId: e.target.value })}
                    placeholder="9876543210@upi"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-6">
                  <label className="flex items-center gap-3 mb-4">
                    <input
                      type="checkbox"
                      checked={gstEnabled}
                      onChange={(e) => setGstEnabled(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm font-bold">Enable GST</span>
                  </label>
                  {gstEnabled && (
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      placeholder="GST Number"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowProfileEditor(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Modals */}
      <PrivacyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
      <TermsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} />
      <RefundModal isOpen={showRefundModal} onClose={() => setShowRefundModal(false)} />
      <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
      {showCardGenerator && <DigitalCardGenerator onClose={() => setShowCardGenerator(false)} />}

      <InputModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account"
        description="This action is permanent and cannot be undone. All your data will be lost."
        placeholder="Type 'DELETE' to confirm"
        validationMatch="DELETE"
        submitLabel="Delete Forever"
        onSubmit={async () => {
          try {
            await deleteAccount();
            showAlert('Account Deleted', 'Your account has been permanently deleted.', 'success');
            setTimeout(() => window.location.href = '/', 1500);
          } catch (e: any) {
            showAlert('Error', e.message, 'danger');
          }
        }}
      />

      <InputModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title="Add Team Member"
        description="Enter email address of the user you want to give access to."
        placeholder="user@example.com"
        type="email"
        submitLabel="Grant Access"
        onSubmit={async (email) => {
          if (email === user?.email) {
            showAlert('Notice', 'You are already the owner!', 'info');
            return;
          }
          const currentEmails = (company as any).allowed_emails || [];
          if (currentEmails.includes(email)) {
            showAlert('Notice', 'User already has access!', 'info');
            return;
          }

          try {
            await saveCompany({
              allowed_emails: [...currentEmails, email]
            } as any);
            showAlert('Success', `${email} added successfully!`, 'success');
          } catch (err) {
            showAlert('Error', 'Failed to add user. Check permissions.', 'danger');
          }
        }}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportBackup}
        accept=".json"
        className="hidden"
      />

      {/* Cloud Config Note */}
      {
        showCloudConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-sm text-center shadow-2xl">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Cloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black mb-2">Cloud Sync</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">Your data is automatically synced using Firebase. To change cloud settings, please update your Firebase project configuration.</p>
              <button onClick={() => setShowCloudConfig(false)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold">Got it</button>
            </div>
          </div>
        )
      }

      {/* AI Config Note */}
      {
        showAiConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-sm text-center shadow-2xl">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black mb-2">AI Smart Import</h3>
              <p className="text-sm text-slate-500 mb-4 leading-relaxed">Enter your Google Gemini API Key to enable AI features like Bill Scanning and Auto-Ads.</p>

              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 text-xs font-bold mb-2 block hover:underline"
              >
                Get your Free API Key Here &rarr;
              </a>

              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-xl mb-4 font-mono text-xs focus:outline-none border border-transparent focus:border-indigo-500"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    AIService.setApiKey(apiKeyInput);
                    setIsGeminiConfigured(!!apiKeyInput);
                    refreshConfig();
                    showAlert("Success", "API Key Saved", "success");
                    setShowAiConfig(false);
                  }}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold"
                >
                  Save Key
                </button>
                <button onClick={() => setShowAiConfig(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold">Close</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Global Alert Modal */}
      <AlertModal
        isOpen={!!alertConfig}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        variant={alertConfig?.variant}
        onClose={() => setAlertConfig(null)}
      />

      {/* Restore Confirmation */}
      <ConfirmationModal
        isOpen={!!pendingRestoreContent}
        title="Restore Data Backup?"
        message="This action will OVERWRITE all current data on this device with the backup data. This cannot be undone."
        confirmText="Restore Data"
        variant="warning"
        onClose={() => setPendingRestoreContent(null)}
        onConfirm={confirmRestore}
      />

      {/* Remove User Confirmation */}
      <ConfirmationModal
        isOpen={!!pendingRemoveUserEmail}
        title="Remove User Access?"
        message={`Are you sure you want to remove access for ${pendingRemoveUserEmail}? They will no longer be able to view or edit this company.`}
        confirmText="Remove User"
        variant="danger"
        onClose={() => setPendingRemoveUserEmail(null)}
        onConfirm={async () => {
          if (company && pendingRemoveUserEmail) {
            const newEmails = (company as any).allowed_emails.filter((e: string) => e !== pendingRemoveUserEmail);
            await saveCompany({ allowed_emails: newEmails } as any);
            setPendingRemoveUserEmail(null);
            showAlert('Success', 'User access removed.', 'success');
          }
        }}
      />

      {/* Backup Choice Modal */}
      {
        showBackupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h3 className="text-xl font-black text-center">Data Management</h3>
              <p className="text-xs text-center text-slate-500 mb-4">Export your data to keep it safe or restore from a previous backup file.</p>

              <button
                onClick={() => {
                  handleDownloadBackup();
                  setShowBackupModal(false);
                }}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" /> Export Backup
              </button>
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowBackupModal(false);
                }}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-foreground rounded-2xl font-bold flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5" /> Import Restore
              </button>
              <button onClick={() => setShowBackupModal(false)} className="w-full py-3 text-slate-400 font-bold text-sm">Cancel</button>
            </div>
          </div>
        )
      }


    </div >
  );
};

export default Settings;