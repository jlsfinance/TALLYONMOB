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
        // Desktop targets
        const desktopId = type === 'title' ? 'header-title' :
            type === 'actions' ? 'header-actions' :
                type === 'search' ? 'header-search' : 'header-filters';
        // Mobile targets
        const mobileId = type === 'title' ? 'header-title-mobile' :
            type === 'search' ? 'header-search-mobile' :
                type === 'filters' ? 'header-filters-mobile' : 'header-actions-mobile';

        setTarget(document.getElementById(desktopId));
        setMobileTarget(document.getElementById(mobileId));
    }, [type]);

    if (!target && !mobileTarget) return null;

    return (
        <>
            {target && createPortal(
                <div className="hidden md:flex items-center">
                    {children}
                </div>,
                target
            )}
            {mobileTarget && createPortal(
                <div className="md:hidden flex items-center">
                    {children}
                </div>,
                mobileTarget
            )}
        </>
    );
};
