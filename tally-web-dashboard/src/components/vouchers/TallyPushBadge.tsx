import { hasTallyPushMarker } from '@/lib/tallyPushNarration';

export function TallyPushBadge({ narration }: { narration?: string | null }) {
    if (!hasTallyPushMarker(narration)) return null;

    return (
        <span className="inline-flex w-fit whitespace-nowrap rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            Sent to Tally
        </span>
    );
}
