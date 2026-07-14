import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface HeaderPortalProps {
    children: React.ReactNode;
    type: 'title' | 'actions' | 'search' | 'filters';
}

export const HeaderPortal: React.FC<HeaderPortalProps> = ({ children, type }) => {
    const [target, setTarget] = useState<HTMLElement | null>(null);
    const [mobileTarget, setMobileTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const desktopId = type === 'title' ? 'header-title' :
            type === 'actions' ? 'header-actions' :
                type === 'search' ? 'header-search' : 'header-filters';
        const mobileId = type === 'title' ? 'header-title-mobile' :
            type === 'search' ? 'header-search-mobile' :
                type === 'filters' ? 'header-filters-mobile' : 'header-actions-mobile';

        const el = document.getElementById(desktopId);
        const mobileEl = document.getElementById(mobileId);
        setTarget(el);
        setMobileTarget(mobileEl);

        // Hide default header content when title is injected
        if (type === 'title') {
            if (el) {
                const parent = el.closest('.flex-1');
                if (parent) {
                    const defaultContent = parent.querySelector('.default-header-content');
                    if (defaultContent) (defaultContent as HTMLElement).style.display = 'none';
                }
            }
            if (mobileEl) {
                const parent = mobileEl.closest('.flex-1');
                if (parent) {
                    const defaultContent = parent.querySelector('.default-header-content');
                    if (defaultContent) (defaultContent as HTMLElement).style.display = 'none';
                }
            }
        }

        // Hide default header actions when actions are injected
        if (type === 'actions') {
            if (el) {
                const parent = el.closest('.flex.items-center');
                if (parent) {
                    const defaultActions = parent.querySelector('.default-header-actions');
                    if (defaultActions) (defaultActions as HTMLElement).style.display = 'none';
                }
            }
            if (mobileEl) {
                const parent = mobileEl.closest('.flex.items-center');
                if (parent) {
                    const defaultActions = parent.querySelector('.default-header-actions');
                    if (defaultActions) (defaultActions as HTMLElement).style.display = 'none';
                }
            }
        }
    }, [type]);

    if (!target && !mobileTarget) return null;

    return (
        <>
            {target && createPortal(
                <div className="hidden md:flex items-center gap-2 min-w-0 overflow-hidden">
                    {children}
                </div>,
                target
            )}
            {mobileTarget && createPortal(
                <div className="md:hidden flex items-center gap-1 min-w-0 overflow-hidden">
                    {children}
                </div>,
                mobileTarget
            )}
        </>
    );
};
