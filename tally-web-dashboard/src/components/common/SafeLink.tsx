import type { MouseEvent, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useSafeNavigate } from '../../hooks/useSafeNavigate';

interface SafeLinkProps extends LinkProps {
    children: ReactNode;
    allowCurrentPath?: boolean;
    lockMs?: number;
}

const isModifiedClick = (event: MouseEvent<HTMLAnchorElement>) => {
    return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
};

export default function SafeLink({
    children,
    to,
    onClick,
    target,
    reloadDocument,
    replace,
    state,
    preventScrollReset,
    relative,
    viewTransition,
    allowCurrentPath = false,
    lockMs,
    ...rest
}: SafeLinkProps) {
    const { navigate, currentPath } = useSafeNavigate(lockMs);
    const targetPath = typeof to === 'string'
        ? to
        : `${to.pathname || ''}${to.search || ''}${to.hash || ''}` || '/';

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);

        if (
            event.defaultPrevented
            || reloadDocument
            || target === '_blank'
            || isModifiedClick(event)
        ) {
            return;
        }

        event.preventDefault();

        if (!allowCurrentPath && targetPath === currentPath && !replace) {
            return;
        }

        navigate(to, { replace, state, preventScrollReset, relative, viewTransition });
    };

    return (
        <Link
            {...rest}
            to={to}
            target={target}
            reloadDocument={reloadDocument}
            replace={replace}
            state={state}
            preventScrollReset={preventScrollReset}
            relative={relative}
            viewTransition={viewTransition}
            onClick={handleClick}
        >
            {children}
        </Link>
    );
}
