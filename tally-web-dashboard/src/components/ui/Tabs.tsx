import React, { useState, useCallback, useRef, useId } from 'react';
import { cn } from '../../lib/utils';

// ============================================================
// Tabs (shadcn/ui style) — WCAG compliant
// ============================================================

/**
 * Tab item definition
 */
export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Visual variant */
  variant?: 'underline' | 'pills' | 'glass';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  /** Content to render for each tab — keyed by tab value */
  children?: React.ReactNode | ((activeTab: string) => React.ReactNode);
}

const sizeStyles = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
} as const;

const Tabs: React.FC<TabsProps> = ({
  tabs,
  value: controlledValue,
  defaultValue = tabs[0]?.value ?? '',
  onChange,
  variant = 'glass',
  size = 'md',
  className,
  tabClassName,
  activeTabClassName,
  children,
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = controlledValue ?? internalValue;
  const tablistRef = useRef<HTMLDivElement>(null);
  const tablistId = useId();

  const handleChange = (val: string) => {
    if (val === activeValue) return;
    if (!controlledValue) setInternalValue(val);
    onChange?.(val);
  };

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      const currentIndex = enabledTabs.findIndex(
        (t) => t.value === activeValue
      );

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex =
            (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = enabledTabs.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== null && enabledTabs[nextIndex]) {
        const nextTab = enabledTabs[nextIndex];
        handleChange(nextTab.value);

        // Focus the corresponding tab button
        const tabButtons = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="tab"]'
        );
        if (tabButtons) {
          const allTabsFlat = tabs.filter((t) => !t.disabled);
          const flatIndex = tabs.indexOf(
            tabs.find((t) => t.value === nextTab.value)!
          );
          tabButtons[flatIndex]?.focus();
        }
      }
    },
    [tabs, activeValue, handleChange]
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Tab List */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-orientation="horizontal"
        className={cn(
          'flex gap-1',
          variant === 'underline' && 'border-b border-[var(--glass-border)]',
          variant === 'glass' &&
            'bg-[var(--glass-bg)] backdrop-blur-[var(--blur-sm)] rounded-[var(--radius-xl)] p-1 border border-[var(--glass-border)]',
          variant === 'pills' && 'gap-2',
        )}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = activeValue === tab.value;
          const tabId = `${tablistId}-tab-${tab.value}`;
          const panelId = `${tablistId}-panel-${tab.value}`;

          return (
            <button
              key={tab.value}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleChange(tab.value)}
              className={cn(
                'inline-flex items-center gap-2 font-semibold transition-all duration-200 rounded-[var(--radius-lg)]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1',
                sizeStyles[size],
                variant === 'underline' &&
                  cn(
                    'border-b-2 border-transparent -mb-px',
                    isActive &&
                      'border-[var(--primary)] text-[var(--primary)]',
                    !isActive &&
                      'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                  ),
                variant === 'pills' &&
                  cn(
                    isActive &&
                      'bg-[var(--primary)] text-white shadow-[var(--shadow-md)]',
                    !isActive &&
                      'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]',
                  ),
                variant === 'glass' &&
                  cn(
                    isActive &&
                      'bg-[var(--glass-bg-hover)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-[var(--shadow-sm)]',
                    !isActive &&
                      'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                  ),
                tabClassName,
                isActive && activeTabClassName,
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {children && (
        <div className="mt-4">
          {typeof children === 'function'
            ? children(activeValue)
            : children}
        </div>
      )}
    </div>
  );
};

Tabs.displayName = 'Tabs';

/**
 * Individual tab panel — wrap content for each tab.
 */
export interface TabsPanelProps {
  value: string;
  activeValue?: string;
  children: React.ReactNode;
  className?: string;
  tablistId?: string;
}

const TabsPanel: React.FC<TabsPanelProps> = ({
  value,
  activeValue,
  children,
  className,
  tablistId,
}) => {
  if (activeValue !== undefined && activeValue !== value) return null;

  const panelId = tablistId ? `${tablistId}-panel-${value}` : undefined;
  const tabId = tablistId ? `${tablistId}-tab-${value}` : undefined;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      className={cn('animate-in fade-in slide-in-from-top-1 duration-200', className)}
    >
      {children}
    </div>
  );
};

TabsPanel.displayName = 'TabsPanel';

export { Tabs, TabsPanel };
