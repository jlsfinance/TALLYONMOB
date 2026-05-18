"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowLeft,
  Banknote,
  Building2,
  Users,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Landmark,
  ShieldCheck,
  Scale,
  Briefcase,
  Receipt,
  ShoppingCart,
  FileText,
  Pencil,
  X,
  BookOpen,
  Layers,
  CircleDollarSign,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface LedgerItem {
  id: string
  name: string
  group: string
  balance: number
  balanceType: 'Dr' | 'Cr'
  openingBalance?: number
}

interface LedgersPageProps {
  ledgers: LedgerItem[]
  onBack: () => void
  onLedgerSelect: (ledger: LedgerItem) => void
  onRefresh?: () => void
  lastSyncTime?: string
}

interface GroupConfig {
  name: string
  icon: React.ElementType
  color: string
  bgColor: string
  darkBgColor: string
}

// ─── Sample/Default Ledger Data ──────────────────────────────────────────────

const DEFAULT_LEDGERS: LedgerItem[] = [
  // Current Assets
  { id: '1', name: 'Petty Cash', group: 'Current Assets', balance: 15000, balanceType: 'Dr' },
  { id: '2', name: 'Stock-in-Hand', group: 'Current Assets', balance: 850000, balanceType: 'Dr' },
  // Bank Accounts
  { id: '3', name: 'HDFC Bank', group: 'Bank Accounts', balance: 250000, balanceType: 'Dr' },
  { id: '4', name: 'SBI Current', group: 'Bank Accounts', balance: 575000, balanceType: 'Dr' },
  // Sundry Debtors
  { id: '5', name: 'ABC Traders', group: 'Sundry Debtors', balance: 120000, balanceType: 'Dr' },
  { id: '6', name: 'Sharma Enterprises', group: 'Sundry Debtors', balance: 85000, balanceType: 'Dr' },
  { id: '7', name: 'Gupta & Sons', group: 'Sundry Debtors', balance: 230000, balanceType: 'Dr' },
  // Sundry Creditors
  { id: '8', name: 'VK Industries', group: 'Sundry Creditors', balance: 150000, balanceType: 'Cr' },
  { id: '9', name: 'Patel Suppliers', group: 'Sundry Creditors', balance: 75000, balanceType: 'Cr' },
]

// ─── Group Configuration ─────────────────────────────────────────────────────

const GROUP_CONFIGS: Record<string, GroupConfig> = {
  'Bank Accounts': {
    name: 'Bank Accounts',
    icon: Building2,
    color: '#059669',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/30',
  },
  'Cash-in-Hand': {
    name: 'Cash-in-Hand',
    icon: Banknote,
    color: '#10B981',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/30',
  },
  'Sundry Debtors': {
    name: 'Sundry Debtors',
    icon: Users,
    color: '#2563EB',
    bgColor: 'bg-blue-50',
    darkBgColor: 'dark:bg-blue-950/30',
  },
  'Sundry Creditors': {
    name: 'Sundry Creditors',
    icon: UserPlus,
    color: '#EA580C',
    bgColor: 'bg-orange-50',
    darkBgColor: 'dark:bg-orange-950/30',
  },
  'Direct Incomes': {
    name: 'Direct Incomes',
    icon: TrendingUp,
    color: '#0D9488',
    bgColor: 'bg-teal-50',
    darkBgColor: 'dark:bg-teal-950/30',
  },
  'Direct Expenses': {
    name: 'Direct Expenses',
    icon: TrendingDown,
    color: '#DC2626',
    bgColor: 'bg-red-50',
    darkBgColor: 'dark:bg-red-950/30',
  },
  'Indirect Incomes': {
    name: 'Indirect Incomes',
    icon: PiggyBank,
    color: '#0D9488',
    bgColor: 'bg-teal-50',
    darkBgColor: 'dark:bg-teal-950/30',
  },
  'Indirect Expenses': {
    name: 'Indirect Expenses',
    icon: Receipt,
    color: '#DC2626',
    bgColor: 'bg-red-50',
    darkBgColor: 'dark:bg-red-950/30',
  },
  'Current Assets': {
    name: 'Current Assets',
    icon: Wallet,
    color: '#0891B2',
    bgColor: 'bg-cyan-50',
    darkBgColor: 'dark:bg-cyan-950/30',
  },
  'Current Liabilities': {
    name: 'Current Liabilities',
    icon: Scale,
    color: '#9333EA',
    bgColor: 'bg-purple-50',
    darkBgColor: 'dark:bg-purple-950/30',
  },
  'Fixed Assets': {
    name: 'Fixed Assets',
    icon: Landmark,
    color: '#0891B2',
    bgColor: 'bg-cyan-50',
    darkBgColor: 'dark:bg-cyan-950/30',
  },
  'Duties & Taxes': {
    name: 'Duties & Taxes',
    icon: ShieldCheck,
    color: '#9333EA',
    bgColor: 'bg-purple-50',
    darkBgColor: 'dark:bg-purple-950/30',
  },
  'Loans & Advances': {
    name: 'Loans & Advances',
    icon: Briefcase,
    color: '#9333EA',
    bgColor: 'bg-purple-50',
    darkBgColor: 'dark:bg-purple-950/30',
  },
  'Capital Account': {
    name: 'Capital Account',
    icon: CircleDollarSign,
    color: '#4F46E5',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  'Reserves & Surplus': {
    name: 'Reserves & Surplus',
    icon: PiggyBank,
    color: '#4F46E5',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  'Sales Accounts': {
    name: 'Sales Accounts',
    icon: ShoppingCart,
    color: '#4F46E5',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  'Purchase Accounts': {
    name: 'Purchase Accounts',
    icon: BookOpen,
    color: '#E11D48',
    bgColor: 'bg-rose-50',
    darkBgColor: 'dark:bg-rose-950/30',
  },
}

const GROUP_ORDER = [
  'Bank Accounts',
  'Cash-in-Hand',
  'Sundry Debtors',
  'Sundry Creditors',
  'Current Assets',
  'Current Liabilities',
  'Fixed Assets',
  'Duties & Taxes',
  'Loans & Advances',
  'Capital Account',
  'Reserves & Surplus',
  'Sales Accounts',
  'Purchase Accounts',
  'Direct Incomes',
  'Direct Expenses',
  'Indirect Incomes',
  'Indirect Expenses',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatIndianCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function groupLedgers(ledgers: LedgerItem[]): Map<string, LedgerItem[]> {
  const groups = new Map<string, LedgerItem[]>()
  for (const ledger of ledgers) {
    const existing = groups.get(ledger.group) || []
    existing.push(ledger)
    groups.set(ledger.group, existing)
  }
  return groups
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function GroupIcon({ group, size = 18 }: { group: string; size?: number }) {
  const config = GROUP_CONFIGS[group]
  if (!config) return <Layers size={size} style={{ color: '#6B7280' }} />
  const Icon = config.icon
  return <Icon size={size} style={{ color: config.color }} />
}

function BalanceDisplay({
  balance,
  balanceType,
}: {
  balance: number
  balanceType: 'Dr' | 'Cr'
}) {
  const isPositive = balance > 0
  const isDebit = balanceType === 'Dr'

  const textColor = isPositive
    ? isDebit
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-blue-600 dark:text-blue-400'
    : 'text-red-600 dark:text-red-400'

  return (
    <span className={cn('text-sm font-semibold tabular-nums', textColor)}>
      {formatIndianCurrency(Math.abs(balance))}{' '}
      <span className="text-[11px] font-medium opacity-80">{balanceType}</span>
    </span>
  )
}

function LedgerRow({
  ledger,
  onSelect,
  onLongPress,
}: {
  ledger: LedgerItem
  onSelect: (ledger: LedgerItem) => void
  onLongPress: (ledger: LedgerItem) => void
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPress = useRef(false)

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      onLongPress(ledger)
    }, 500)
  }, [ledger, onLongPress])

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (!isLongPress.current) {
      onSelect(ledger)
    }
  }, [ledger, onSelect])

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center justify-between px-4 py-3 cursor-pointer',
        'hover:bg-slate-50 dark:hover:bg-slate-800/50',
        'active:bg-slate-100 dark:active:bg-slate-800',
        'transition-colors duration-150 select-none',
        'relative'
      )}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handlePointerDown}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerLeave}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800">
          <GroupIcon group={ledger.group} size={14} />
        </div>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {ledger.name}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <BalanceDisplay balance={ledger.balance} balanceType={ledger.balanceType} />
        <ChevronRight size={14} className="text-slate-400 dark:text-slate-600" />
      </div>
    </motion.div>
  )
}

function QuickActionsMenu({
  ledger,
  onClose,
  onViewTransactions,
  onEditBalance,
}: {
  ledger: LedgerItem
  onClose: () => void
  onViewTransactions: (ledger: LedgerItem) => void
  onEditBalance: (ledger: LedgerItem) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          'relative w-full max-w-lg mx-auto rounded-t-2xl',
          'bg-white dark:bg-slate-900',
          'shadow-2xl shadow-slate-200/50 dark:shadow-black/50',
          'overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800">
              <GroupIcon group={ledger.group} size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {ledger.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{ledger.group}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <Separator className="mb-2" />

        <div className="px-3 pb-6 space-y-1">
          <button
            onClick={() => onViewTransactions(ledger)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'active:bg-slate-200 dark:active:bg-slate-700',
              'transition-colors duration-150'
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <FileText size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                View Transactions
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                See all entries for this ledger
              </p>
            </div>
          </button>

          <button
            onClick={() => onEditBalance(ledger)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'active:bg-slate-200 dark:active:bg-slate-700',
              'transition-colors duration-150'
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Pencil size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Edit Balance
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adjust opening or current balance
              </p>
            </div>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function GroupAccordion({
  groupName,
  ledgers,
  isExpanded,
  onToggle,
  onLedgerSelect,
  onLedgerLongPress,
}: {
  groupName: string
  ledgers: LedgerItem[]
  isExpanded: boolean
  onToggle: () => void
  onLedgerSelect: (ledger: LedgerItem) => void
  onLedgerLongPress: (ledger: LedgerItem) => void
}) {
  const config = GROUP_CONFIGS[groupName]
  const Icon = config?.icon || Layers
  const color = config?.color || '#6B7280'
  const bgClass = config?.bgColor || 'bg-slate-50'
  const darkBgClass = config?.darkBgColor || 'dark:bg-slate-800/50'

  // Calculate net balance for the group
  const netBalance = ledgers.reduce((sum, l) => {
    return l.balanceType === 'Dr' ? sum + l.balance : sum - l.balance
  }, 0)
  const netType: 'Dr' | 'Cr' = netBalance >= 0 ? 'Dr' : 'Cr'

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800',
        'bg-white dark:bg-slate-900/80',
        'shadow-sm'
      )}
    >
      {/* Group Header */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3.5',
          'hover:bg-slate-50 dark:hover:bg-slate-800/50',
          'active:bg-slate-100 dark:active:bg-slate-800',
          'transition-colors duration-150 select-none',
          'relative'
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Icon with colored background */}
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              bgClass,
              darkBgClass
            )}
          >
            <Icon size={16} style={{ color }} />
          </div>

          {/* Group name and count */}
          <div className="min-w-0 flex-1 text-left">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {groupName}
            </span>
            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-medium">
              {ledgers.length} ledger{ledgers.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Net balance and chevron */}
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {formatIndianCurrency(Math.abs(netBalance))}{' '}
            <span className="text-[10px]">{netType}</span>
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />
          </motion.div>
        </div>
      </button>

      {/* Ledger Items */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 dark:border-slate-800">
              {ledgers.map((ledger, index) => (
                <React.Fragment key={ledger.id}>
                  {index > 0 && (
                    <Separator className="mx-4 w-auto" />
                  )}
                  <LedgerRow
                    ledger={ledger}
                    onSelect={onLedgerSelect}
                    onLongPress={onLedgerLongPress}
                  />
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const LedgersPage: React.FC<LedgersPageProps> = ({
  ledgers: propLedgers,
  onBack,
  onLedgerSelect,
  onRefresh,
  lastSyncTime,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [longPressedLedger, setLongPressedLedger] = useState<LedgerItem | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Use provided ledgers or fall back to defaults
  const ledgers = propLedgers?.length ? propLedgers : DEFAULT_LEDGERS

  // Filter ledgers by search query
  const filteredLedgers = useMemo(() => {
    if (!searchQuery.trim()) return ledgers

    const query = searchQuery.toLowerCase().trim()
    return ledgers.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        l.group.toLowerCase().includes(query)
    )
  }, [ledgers, searchQuery])

  // Group filtered ledgers
  const groupedLedgers = useMemo(() => groupLedgers(filteredLedgers), [filteredLedgers])

  // Get sorted group entries
  const sortedGroupEntries = useMemo(() => {
    const entries: [string, LedgerItem[]][] = []

    // Add groups in defined order if they have ledgers
    for (const groupName of GROUP_ORDER) {
      const groupLedgers = groupedLedgers.get(groupName)
      if (groupLedgers && groupLedgers.length > 0) {
        entries.push([groupName, groupLedgers])
      }
    }

    // Add any extra groups not in the defined order
    for (const [groupName, groupLedgers] of groupedLedgers.entries()) {
      if (!GROUP_ORDER.includes(groupName)) {
        entries.push([groupName, groupLedgers])
      }
    }

    return entries
  }, [groupedLedgers])

  // Auto-expand groups when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const allGroups = new Set<string>()
      for (const [groupName] of groupedLedgers.entries()) {
        allGroups.add(groupName)
      }
      setExpandedGroups(allGroups)
    } else {
      setExpandedGroups(new Set())
    }
  }, [searchQuery, groupedLedgers])

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }, [])

  const handleLedgerLongPress = useCallback((ledger: LedgerItem) => {
    setLongPressedLedger(ledger)
  }, [])

  const handleCloseQuickActions = useCallback(() => {
    setLongPressedLedger(null)
  }, [])

  const handleViewTransactions = useCallback(
    (ledger: LedgerItem) => {
      setLongPressedLedger(null)
      onLedgerSelect(ledger)
    },
    [onLedgerSelect]
  )

  const handleEditBalance = useCallback(
    (ledger: LedgerItem) => {
      setLongPressedLedger(null)
      onLedgerSelect(ledger)
    },
    [onLedgerSelect]
  )

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }, [onRefresh])

  // Total count
  const totalCount = ledgers.length
  const filteredCount = filteredLedgers.length
  const hasSearch = searchQuery.trim().length > 0

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* ─── Top Bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
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
            <h1 className="text-lg font-bold" style={{ color: '#1976D2' }}>
              Ledgers
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {lastSyncTime && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Synced: {lastSyncTime}
              </span>
            )}
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  'p-2 rounded-full',
                  'hover:bg-slate-100 dark:hover:bg-slate-800',
                  'active:bg-slate-200 dark:active:bg-slate-700',
                  'transition-colors duration-150',
                  isRefreshing && 'opacity-50'
                )}
                aria-label="Refresh"
              >
                <RefreshCw
                  size={16}
                  className={cn(
                    'text-slate-500 dark:text-slate-400',
                    isRefreshing && 'animate-spin'
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
            <Input
              type="search"
              placeholder="Search ledgers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'pl-9 pr-9 h-10 text-sm',
                'rounded-xl',
                'bg-slate-100 dark:bg-slate-800',
                'border-slate-200 dark:border-slate-700',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus-visible:ring-2 focus-visible:ring-[#1976D2]/30',
                'focus-visible:border-[#1976D2]'
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={14} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Content ─────────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="px-4 pt-4 pb-24 space-y-3">
          {/* Summary badge */}
          {!hasSearch && totalCount > 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {sortedGroupEntries.length} groups &middot; {totalCount} ledgers
              </p>
            </div>
          )}

          {hasSearch && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
              {filteredCount} result{filteredCount !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* Groups */}
          {sortedGroupEntries.length > 0 ? (
            sortedGroupEntries.map(([groupName, groupLedgers]) => (
              <GroupAccordion
                key={groupName}
                groupName={groupName}
                ledgers={groupLedgers}
                isExpanded={expandedGroups.has(groupName)}
                onToggle={() => toggleGroup(groupName)}
                onLedgerSelect={onLedgerSelect}
                onLedgerLongPress={handleLedgerLongPress}
              />
            ))
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-20 px-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <Search size={28} className="text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No ledgers found
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center max-w-xs">
                {hasSearch
                  ? `No ledgers match "${searchQuery}". Try a different search term.`
                  : 'No ledgers available. Add transactions to create ledgers automatically.'}
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* ─── Quick Actions Modal ────────────────────────────────── */}
      <AnimatePresence>
        {longPressedLedger && (
          <QuickActionsMenu
            ledger={longPressedLedger}
            onClose={handleCloseQuickActions}
            onViewTransactions={handleViewTransactions}
            onEditBalance={handleEditBalance}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default LedgersPage
