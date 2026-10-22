import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { memo, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';

/* ───────────────────────────────────────────
   Types
   ─────────────────────────────────────────── */
export interface BottomNavItem {
    to: string;
    icon: React.ReactNode;
    label: string;
    badge?: number | string;
}

interface Props {
    items: BottomNavItem[];
}

/* ───────────────────────────────────────────
   Constants
   ─────────────────────────────────────────── */

/** Spring config — responsive, bouncy but controlled */
const INDICATOR_SPRING = { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.7 };

/** Badge scale spring for count-change pulse */
const BADGE_SPRING = { type: 'spring' as const, stiffness: 800, damping: 12 };

/* ───────────────────────────────────────────
   Haptic feedback (native only, noop otherwise)
   ─────────────────────────────────────────── */
async function lightHaptic() {
    try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
        /* Not on native — silently skip */
    }
}

/* ───────────────────────────────────────────
   Animated Badge (pulses when count changes)
   ─────────────────────────────────────────── */
const AnimatedBadge = memo(function AnimatedBadge({ count }: { count: number | string }) {
    const [prevCount, setPrevCount] = useState(count);
    const pulse = prevCount !== count;

    useEffect(() => {
        if (pulse) {
            const t = setTimeout(() => setPrevCount(count), 300);
            return () => clearTimeout(t);
        }
    }, [count, pulse]);

    return (
        <motion.span
            key={String(count)}
            initial={pulse ? { scale: 0 } : false}
            animate={
                pulse
                    ? { scale: [0, 1.3, 1] }
                    : { scale: 1 }
            }
            transition={pulse ? { ...BADGE_SPRING, duration: 0.4 } : { duration: 0.2 }}
            className="absolute -top-1 -right-1 z-10
                       min-w-[16px] h-[15px] px-1 rounded-full
                       bg-gradient-to-br from-[var(--error)] to-[var(--error)]/80
                       text-white text-[9px] font-bold leading-none
                       flex items-center justify-center
                       shadow-[0_2px_6px_var(--error)/40%]"
            aria-label={`${count} notifications`}
        >
            {count > 99 ? '99+' : count}
        </motion.span>
    );
});

/* ───────────────────────────────────────────
   Single Tab
   ─────────────────────────────────────────── */
const TabLink = memo(function TabLink({
    item,
    isActive,
    onTap,
    index,
}: {
    item: BottomNavItem;
    isActive: boolean;
    onTap: () => void;
    index: number;
}) {
    const scaleVal = useMotionValue(1);
    const springScale = useSpring(scaleVal, { stiffness: 600, damping: 18 });

    const handlePointerDown = useCallback(() => {
        scaleVal.set(0.92);
    }, [scaleVal]);

    const handlePointerUp = useCallback(() => {
        scaleVal.set(1);
    }, [scaleVal]);

    return (
        <Link
            to={item.to}
            onClick={onTap}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="flex-1 relative flex items-center justify-center outline-none
                       focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40
                       focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]
                       rounded-lg"
            aria-current={isActive ? 'page' : undefined}
            aria-label={`${item.label}${item.badge != null ? ` (${item.badge})` : ''}`}
        >
            <motion.div
                style={{ scale: springScale }}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 relative"
            >
                {/* ── Icon container ── */}
                <div
                    className={clsx(
                        'p-1.5 rounded-xl relative transition-colors duration-200',
                        isActive
                            ? 'bg-gradient-to-br from-[var(--primary)]/20 via-[var(--primary)]/12 to-[var(--primary)]/5 shadow-sm shadow-[var(--primary)]/10'
                            : ''
                    )}
                >
                    {/* Glow ring behind active icon */}
                    {isActive && (
                        <motion.div
                            layoutId="bottom-nav-icon-glow"
                            className="absolute inset-0 rounded-xl
                                       bg-[var(--primary)]/5 blur-sm"
                            transition={{ duration: 0.2 }}
                        />
                    )}

                    <motion.div
                        animate={{
                            scale: isActive ? 1 : 0.92,
                            opacity: isActive ? 1 : 0.55,
                            filter: isActive
                                ? 'drop-shadow(0 1px 2px var(--primary)/30%)'
                                : 'drop-shadow(0 0 0 transparent)',
                        }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="relative"
                    >
                        {item.icon}
                    </motion.div>

                    {/* Badge */}
                    {item.badge != null && (
                        <AnimatedBadge count={item.badge} />
                    )}
                </div>

                {/* ── Label ── */}
                <motion.span
                    animate={{
                        scale: isActive ? 1 : 0.85,
                        opacity: isActive ? 1 : 0,
                        y: isActive ? 0 : 6,
                    }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className={clsx(
                        'text-[10px] font-semibold select-none',
                        isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                    )}
                >
                    {item.label}
                </motion.span>
            </motion.div>
        </Link>
    );
});

/* ───────────────────────────────────────────
   Bottom Nav Bar
   ─────────────────────────────────────────── */
function MobileBottomNav({ items }: Props) {
    const location = useLocation();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Animate in on mount
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    // Determine active index
    const activeIndex = useMemo(
        () => items.findIndex(item => location.pathname === item.to),
        [items, location.pathname]
    );

    const handleTap = useCallback(() => {
        lightHaptic();
    }, []);

    return (
        <motion.nav
            initial={{ y: 60, opacity: 0 }}
            animate={mounted ? { y: 0, opacity: 1 } : { y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-50
                       bg-[var(--surface)]/92 backdrop-blur-2xl
                       border-t border-[var(--border)]
                       pb-[env(safe-area-inset-bottom,0px)]
                       safe-area-pb"
            role="navigation"
            aria-label="Main navigation"
        >
            <div className="relative flex items-center h-[60px] px-1.5">
                {/* ── Animated sliding indicator ── */}
                {activeIndex >= 0 && (
                    <motion.div
                        layoutId="bottom-nav-active-indicator"
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                            width: `${100 / items.length}%`,
                            left: `${(activeIndex * 100) / items.length}%`,
                        }}
                        transition={INDICATOR_SPRING}
                    >
                        {/* Pill background */}
                        <div className="mx-auto mt-0.5 w-[calc(100%-12px)] h-[calc(100%-4px)]
                                        rounded-2xl bg-[var(--primary)]/8
                                        border border-[var(--primary)]/10
                                        shadow-inner shadow-[var(--primary)]/5" />

                        {/* Top accent line */}
                        <div className="mx-auto mt-0.5 h-[3px] w-10
                                        rounded-full bg-[var(--primary)]
                                        shadow-[0_1px_6px_var(--primary)/40%]" />
                    </motion.div>
                )}

                {/* ── Tab links ── */}
                {items.map((item, idx) => (
                    <TabLink
                        key={item.to}
                        item={item}
                        isActive={location.pathname === item.to}
                        onTap={handleTap}
                        index={idx}
                    />
                ))}
            </div>
        </motion.nav>
    );
}

export default memo(MobileBottomNav);
