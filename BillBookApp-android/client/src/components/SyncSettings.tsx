"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Save,
  Wifi,
  WifiOff,
  RefreshCw,
  Settings,
  Server,
  Building2,
  Clock,
  Lock,
  Zap,
  Play,
  Database,
  BookOpen,
  Package,
  FileText,
  Users,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SyncSettingsProps {
  onBack: () => void
  syncConfig?: {
    serverIp: string
    port: number
    companyName: string
  }
  connectionStatus?: 'connected' | 'disconnected' | 'testing'
  lastSyncTime?: string
  onSaveConfig?: (config: any) => void
  onTestConnection?: () => void
  onSyncNow?: () => void
}

interface SyncItemStatus {
  label: string
  icon: React.ElementType
  count: number
  total: number
  status: 'synced' | 'syncing' | 'pending' | 'error'
}

type SyncFrequency = '15min' | '30min' | '1hour' | '6hours' | 'daily'
type SyncMode = 'full' | 'incremental'

// ─── Sample Company Names ───────────────────────────────────────────────────

const SAMPLE_COMPANIES = [
  'ABC Traders',
  'Sharma Enterprises',
  'Gupta & Sons',
  'Patel Suppliers',
  'VK Industries',
  'Desai Distributors',
  'Mehta Corporation',
  'Singh Brothers',
  'JLS Corporation',
  'BillBook Demo Company',
]

// ─── Frequency Labels ───────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: SyncFrequency; label: string }[] = [
  { value: '15min', label: 'Every 15 minutes' },
  { value: '30min', label: 'Every 30 minutes' },
  { value: '1hour', label: 'Every 1 hour' },
  { value: '6hours', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export const SyncSettings: React.FC<SyncSettingsProps> = ({
  onBack,
  syncConfig,
  connectionStatus = 'disconnected',
  lastSyncTime,
  onSaveConfig,
  onTestConnection,
  onSyncNow,
}) => {
  // ── Form State ──────────────────────────────────────────────────────────
  const [serverIp, setServerIp] = useState(syncConfig?.serverIp || '')
  const [port, setPort] = useState(String(syncConfig?.port || 9000))
  const [companyName, setCompanyName] = useState(syncConfig?.companyName || '')
  const [password, setPassword] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [companyFilter, setCompanyFilter] = useState('')

  // ── Sync Controls State ─────────────────────────────────────────────────
  const [autoSync, setAutoSync] = useState(false)
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>('30min')
  const [syncMode, setSyncMode] = useState<SyncMode>('incremental')
  const [isSyncing, setIsSyncing] = useState(false)

  // ── Data Sync Status State ──────────────────────────────────────────────
  const [syncItems, setSyncItems] = useState<SyncItemStatus[]>([
    { label: 'Ledgers', icon: BookOpen, count: 42, total: 42, status: 'synced' },
    { label: 'Stock Items', icon: Package, count: 156, total: 156, status: 'synced' },
    { label: 'Vouchers', icon: FileText, count: 89, total: 120, status: 'pending' },
    { label: 'Customers', icon: Users, count: 28, total: 28, status: 'synced' },
  ])

  // ── Derived ─────────────────────────────────────────────────────────────
  const filteredCompanies = useMemo(() => {
    if (!companyFilter) return SAMPLE_COMPANIES
    return SAMPLE_COMPANIES.filter((c) =>
      c.toLowerCase().includes(companyFilter.toLowerCase())
    )
  }, [companyFilter])

  const overallProgress = useMemo(() => {
    const totalItems = syncItems.reduce((sum, item) => sum + item.total, 0)
    const syncedItems = syncItems.reduce((sum, item) => sum + item.count, 0)
    return totalItems > 0 ? Math.round((syncedItems / totalItems) * 100) : 0
  }, [syncItems])

  const isConnected = connectionStatus === 'connected'
  const isTesting = connectionStatus === 'testing'

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveConfig = () => {
    onSaveConfig?.({
      serverIp,
      port: parseInt(port, 10) || 9000,
      companyName,
      password: password || undefined,
    })
  }

  const handleSyncNow = async () => {
    if (isSyncing) return
    setIsSyncing(true)

    // Simulate sync progress
    setSyncItems((prev) =>
      prev.map((item) =>
        item.status === 'pending' ? { ...item, status: 'syncing' as const } : item
      )
    )

    // If the prop handler exists, call it
    onSyncNow?.()

    // Simulate progress animation (in real app, this would come from backend)
    let progress = 0
    const interval = setInterval(() => {
      progress += 5
      setSyncItems((prev) =>
        prev.map((item) => {
          if (item.status === 'syncing') {
            const newCount = Math.min(
              item.count + Math.ceil(item.total * 0.05),
              item.total
            )
            const done = newCount >= item.total
            return {
              ...item,
              count: newCount,
              status: done ? ('synced' as const) : ('syncing' as const),
            }
          }
          return item
        })
      )
      if (progress >= 100) {
        clearInterval(interval)
        setIsSyncing(false)
      }
    }, 400)
  }

  const handleTestConnection = () => {
    onTestConnection?.()
  }

  const handleSelectCompany = (name: string) => {
    setCompanyName(name)
    setShowCompanyDropdown(false)
    setCompanyFilter('')
  }

  // ── Status Indicator ────────────────────────────────────────────────────
  const StatusDot = ({ connected }: { connected: boolean }) => (
    <span
      className={cn(
        'inline-block w-2.5 h-2.5 rounded-full',
        connected
          ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
          : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
      )}
    />
  )

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full bg-slate-50 dark:bg-slate-950"
    >
      {/* ─── Top Bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className={cn(
                'p-2 -ml-2 rounded-full',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                'active:bg-slate-200 dark:active:bg-slate-700',
                'transition-colors duration-150'
              )}
              aria-label="Back"
            >
              <ArrowLeft size={20} className="text-slate-700 dark:text-slate-300" />
            </button>
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-[#1976D2]" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Sync Settings
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 px-2.5 py-1 text-[11px] font-medium',
                isConnected
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              )}
            >
              <StatusDot connected={isConnected} />
              {isTesting
                ? 'Testing...'
                : isConnected
                  ? 'Connected'
                  : 'Disconnected'}
            </Badge>
          </div>
        </div>
      </div>

      {/* ─── Scrollable Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 pb-24 space-y-4">

          {/* ─── 1. Connection Form ──────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
          >
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Server size={16} className="text-[#1976D2]" />
                  <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Tally Connection
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Server IP */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Server IP Address
                  </label>
                  <div className="relative">
                    <Server
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
                    />
                    <Input
                      type="text"
                      placeholder="192.168.1.100"
                      value={serverIp}
                      onChange={(e) => setServerIp(e.target.value)}
                      className={cn(
                        'pl-9 h-10 text-sm',
                        'rounded-xl',
                        'bg-slate-100 dark:bg-slate-800',
                        'border-slate-200 dark:border-slate-700',
                        'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                        'focus-visible:ring-2 focus-visible:ring-[#1976D2]/30',
                        'focus-visible:border-[#1976D2]'
                      )}
                    />
                  </div>
                </div>

                {/* Port */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Port
                  </label>
                  <Input
                    type="number"
                    placeholder="9000"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className={cn(
                      'h-10 text-sm',
                      'rounded-xl',
                      'bg-slate-100 dark:bg-slate-800',
                      'border-slate-200 dark:border-slate-700',
                      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                      'focus-visible:ring-2 focus-visible:ring-[#1976D2]/30',
                      'focus-visible:border-[#1976D2]'
                    )}
                  />
                </div>

                {/* Company Name (Autocomplete input) */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Tally Company Name
                  </label>
                  <div className="relative">
                    <Building2
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
                    />
                    <Input
                      type="text"
                      placeholder="Search or type company name..."
                      value={companyName}
                      onFocus={() => setShowCompanyDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setShowCompanyDropdown(false), 200)
                      }
                      onChange={(e) => {
                        setCompanyName(e.target.value)
                        setCompanyFilter(e.target.value)
                        setShowCompanyDropdown(true)
                      }}
                      className={cn(
                        'pl-9 h-10 text-sm',
                        'rounded-xl',
                        'bg-slate-100 dark:bg-slate-800',
                        'border-slate-200 dark:border-slate-700',
                        'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                        'focus-visible:ring-2 focus-visible:ring-[#1976D2]/30',
                        'focus-visible:border-[#1976D2]'
                      )}
                    />
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
                    />
                  </div>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {showCompanyDropdown && filteredCompanies.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          'absolute z-50 top-full mt-1 w-full',
                          'bg-white dark:bg-slate-800',
                          'border border-slate-200 dark:border-slate-700',
                          'rounded-xl shadow-lg',
                          'overflow-hidden'
                        )}
                      >
                        <div className="max-h-48 overflow-y-auto py-1">
                          {filteredCompanies.map((name) => (
                            <button
                              key={name}
                              onMouseDown={() => handleSelectCompany(name)}
                              className={cn(
                                'w-full text-left px-4 py-2.5 text-sm',
                                'hover:bg-slate-100 dark:hover:bg-slate-700',
                                'transition-colors duration-100',
                                companyName === name
                                  ? 'bg-[#1976D2]/10 text-[#1976D2] font-semibold'
                                  : 'text-slate-700 dark:text-slate-300'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Building2 size={14} className="shrink-0 text-slate-400" />
                                <span>{name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Password (optional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Password <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <Lock
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
                    />
                    <Input
                      type="password"
                      placeholder="Tally password if required"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={cn(
                        'pl-9 h-10 text-sm',
                        'rounded-xl',
                        'bg-slate-100 dark:bg-slate-800',
                        'border-slate-200 dark:border-slate-700',
                        'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                        'focus-visible:ring-2 focus-visible:ring-[#1976D2]/30',
                        'focus-visible:border-[#1976D2]'
                      )}
                    />
                  </div>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveConfig}
                  disabled={!serverIp || !companyName}
                  className={cn(
                    'w-full h-11 rounded-xl text-sm font-bold',
                    'bg-[#1976D2] hover:bg-[#1565C0]',
                    'text-white',
                    'shadow-sm',
                    'transition-all duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <Save size={16} className="mr-2" />
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── 2. Connection Status ────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
          >
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#1976D2]" />
                  <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Connection Status
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status indicator */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60">
                  <div className="flex items-center gap-3">
                    {isConnected ? (
                      <Wifi size={20} className="text-emerald-500" />
                    ) : (
                      <WifiOff size={20} className="text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {isTesting
                          ? 'Testing Connection...'
                          : isConnected
                            ? 'Connected'
                            : 'Disconnected'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {isConnected
                          ? `Tally at ${serverIp || '...'}:${port || '9000'}`
                          : 'No active connection to Tally'}
                      </p>
                    </div>
                  </div>
                  <StatusDot connected={isConnected} />
                </div>

                {/* Last sync time */}
                {lastSyncTime && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Clock size={12} />
                    <span>Last sync: {lastSyncTime}</span>
                  </div>
                )}

                {/* Test Connection Button */}
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting || !serverIp}
                  variant="outline"
                  className={cn(
                    'w-full h-11 rounded-xl text-sm font-bold',
                    'border-slate-300 dark:border-slate-600',
                    'text-slate-700 dark:text-slate-300',
                    'hover:bg-slate-100 dark:hover:bg-slate-800',
                    'transition-all duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isTesting ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} className="mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── 3. Sync Controls ────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-[#1976D2]" />
                  <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Sync Controls
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sync Now - Big button */}
                <Button
                  onClick={handleSyncNow}
                  disabled={isSyncing || !isConnected}
                  className={cn(
                    'w-full h-14 rounded-xl text-base font-bold',
                    'bg-[#1976D2] hover:bg-[#1565C0]',
                    'text-white',
                    'shadow-md',
                    'transition-all duration-150 active:scale-[0.98]',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 size={20} className="mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={20} className="mr-2" />
                      Sync Now
                    </>
                  )}
                </Button>

                {/* Auto Sync Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60">
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-slate-500 dark:text-slate-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Auto-Sync
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Automatically sync on schedule
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={autoSync}
                    onCheckedChange={setAutoSync}
                    className="data-[state=checked]:bg-[#1976D2]"
                  />
                </div>

                {/* Sync Frequency Dropdown */}
                <AnimatePresence>
                  {autoSync && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Sync Frequency
                      </label>
                      <Select
                        value={syncFrequency}
                        onValueChange={(val) => setSyncFrequency(val as SyncFrequency)}
                      >
                        <SelectTrigger
                          className={cn(
                            'w-full h-10 text-sm rounded-xl',
                            'bg-slate-100 dark:bg-slate-800',
                            'border-slate-200 dark:border-slate-700',
                            'focus:ring-2 focus:ring-[#1976D2]/30',
                            'focus:border-[#1976D2]'
                          )}
                        >
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Full Sync vs Incremental Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60">
                  <div className="flex items-center gap-3">
                    <Database size={16} className="text-slate-500 dark:text-slate-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Sync Mode
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {syncMode === 'full' ? 'Full re-sync all data' : 'Only sync changes'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors',
                        syncMode === 'incremental'
                          ? 'bg-[#1976D2]/10 text-[#1976D2]'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      Incremental
                    </span>
                    <Switch
                      checked={syncMode === 'full'}
                      onCheckedChange={(checked) =>
                        setSyncMode(checked ? 'full' : 'incremental')
                      }
                      className="data-[state=checked]:bg-[#1976D2]"
                    />
                    <span
                      className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors',
                        syncMode === 'full'
                          ? 'bg-[#1976D2]/10 text-[#1976D2]'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      Full
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── 4. Data Sync Status ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.2 }}
          >
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-[#1976D2]" />
                    <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Data Sync Status
                    </CardTitle>
                  </div>
                  <span className="text-xs font-bold text-[#1976D2]">
                    {overallProgress}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Overall Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Overall sync progress</span>
                    <span>
                      {syncItems.reduce((s, i) => s + i.count, 0)} /{' '}
                      {syncItems.reduce((s, i) => s + i.total, 0)} items
                    </span>
                  </div>
                  <Progress
                    value={overallProgress}
                    className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700"
                  />
                </div>

                {/* Individual Items */}
                <div className="space-y-3">
                  {syncItems.map((item, idx) => {
                    const ItemIcon = item.icon
                    const itemProgress =
                      item.total > 0
                        ? Math.round((item.count / item.total) * 100)
                        : 0
                    const isItemSynced = item.status === 'synced'
                    const isItemSyncing = item.status === 'syncing'
                    const isItemError = item.status === 'error'

                    return (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 * (idx + 1) }}
                        className="space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ItemIcon
                              size={14}
                              className={cn(
                                isItemSynced
                                  ? 'text-emerald-500'
                                  : isItemSyncing
                                    ? 'text-amber-500'
                                    : isItemError
                                      ? 'text-red-500'
                                      : 'text-slate-400'
                              )}
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {item.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {item.count}/{item.total}
                            </span>
                            {isItemSynced ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : isItemSyncing ? (
                              <Loader2 size={14} className="text-amber-500 animate-spin" />
                            ) : isItemError ? (
                              <XCircle size={14} className="text-red-500" />
                            ) : (
                              <Clock size={14} className="text-slate-400" />
                            )}
                          </div>
                        </div>
                        <Progress
                          value={itemProgress}
                          className={cn(
                            'h-1.5 rounded-full',
                            'bg-slate-200 dark:bg-slate-700',
                            isItemSynced && '[&>div]:bg-emerald-500',
                            isItemSyncing && '[&>div]:bg-amber-500',
                            isItemError && '[&>div]:bg-red-500',
                            !isItemSynced &&
                              !isItemSyncing &&
                              !isItemError &&
                              '[&>div]:bg-slate-300 dark:[&>div]:bg-slate-600'
                          )}
                        />
                      </motion.div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Info Note ──────────────────────────────────────────── */}
          <div className="text-center px-4">
            <p className="text-xs text-slate-400 dark:text-slate-600 leading-relaxed">
              Configure your Tally connection settings above to sync data between
              BillBook and your Tally ERP instance. Ensure Tally is running with
              the Tally ERP Gateway enabled.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default SyncSettings
