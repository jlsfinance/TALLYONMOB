import React from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
}

export default function PullToRefresh({ children }: PullToRefreshProps) {
    return <div className="w-full">{children}</div>;
}
