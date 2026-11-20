const marker = '[Sent from SYNCORA]';

export function hasTallyPushMarker(narration?: string | null): boolean {
    return narration?.split('\n').some(line => line.trim() === marker) ?? false;
}

export function markTallyPushNarration(narration?: string | null): string {
    if (!narration?.trim()) return marker;
    return hasTallyPushMarker(narration) ? narration : `${narration}\n${marker}`;
}
