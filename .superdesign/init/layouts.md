# Layouts

Shared layout components and app shell.

## AppLayout
- Source: `src/components/layout/AppLayout.tsx`
- Description: Main application shell with sidebar (desktop) and bottom nav (mobile). Handles theme switching, company selection, and navigation groups.

```tsx
import { useState, useEffect, memo, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import LanguageSelector from './LanguageSelector';
import AIFloatingButton from '../AIFloatingButton';
import {
    LayoutDashboard, FileText, Users, TrendingUp, Package, Shield,
    ChevronLeft, ChevronRight, Sun, Moon, Menu, X, Plus,
    Box, RefreshCw, Bell, ChevronDown, BarChart3, Scale, Lock,
    LineChart, Building2, Sparkles, LogOut, ArrowLeftRight,
    Bot, UserX, MessageCircle, ClipboardList, Truck, MapPin,
    Palette, CreditCard, ScanLine, Database, ShieldCheck,
    Repeat, Globe, FileSpreadsheet, Settings
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// Navigation Item
const NavItem = memo(({
    to, icon, label, collapsed, active
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; active: boolean }) => {
    return (
        <Link to={to}>
            <div className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1
                transition-all duration-200 group text-[13px]
                ${active
                    ? 'bg-[var(--primary)] text-white font-semibold shadow-lg shadow-[var(--primary-glow)]'
                    : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] font-medium active:scale-95'
                }
                ${collapsed ? 'justify-center px-0 w-10 h-10 mx-auto' : ''}
            `}>
                <span className="flex-shrink-0">{icon}</span>
                {!collapsed && <span className="truncate">{label}</span>}
            </div>
        </Link>
    );
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, companies, selectedCompany, selectCompany, signOut, appMode } = useAuth() as any;
    const { isDark, toggleTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // ... (rest of implementation)
}
```
*Note: Full source code available in `src/components/layout/AppLayout.tsx`.*
