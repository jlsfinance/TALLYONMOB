import { similarityScore } from '@/features/automation/fuzzy';
import type { MappingCandidate, MappingResolution, MappingTargetOption, NameMappingRecord, NameMappingType } from './types';
import { getCanonicalMappingSource, normalizeNameMappingSource } from './store';

function tokenize(value: string): string[] {
    return normalizeNameMappingSource(value)
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

function overlapRatio(left: string, right: string): number {
    const leftTokens = tokenize(left);
    const rightTokens = tokenize(right);

    if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);

    let overlap = 0;
    leftSet.forEach((token) => {
        if (rightSet.has(token)) overlap += 1;
    });

    return overlap / Math.max(leftSet.size, rightSet.size);
}

function rankCandidate(sourceText: string, option: MappingTargetOption): MappingCandidate {
    const normalizedSource = normalizeNameMappingSource(sourceText);
    const normalizedOption = normalizeNameMappingSource(option.name);

    if (!normalizedSource || !normalizedOption) {
        return {
            entityType: option.entityType,
            displayName: option.name,
            entityId: option.id,
            confidence: 0,
            reason: 'No usable text',
            stage: 'unresolved'
        };
    }

    if (normalizedSource === normalizedOption) {
        return {
            entityType: option.entityType,
            displayName: option.name,
            entityId: option.id,
            confidence: 100,
            reason: 'Exact match',
            stage: 'exact'
        };
    }

    const startsWith = normalizedOption.startsWith(normalizedSource) || normalizedSource.startsWith(normalizedOption);
    const overlap = overlapRatio(normalizedSource, normalizedOption);
    const fuzzy = similarityScore(normalizedSource, normalizedOption);
    let confidence = Math.max(fuzzy, Math.round(overlap * 100));
    let stage: MappingCandidate['stage'] = 'fuzzy';
    let reason = 'Similar name match';

    if (startsWith && overlap >= 0.6) {
        confidence = Math.max(confidence, 94);
        stage = 'prefix';
        reason = 'Unique prefix/alias match';
    } else if (normalizedSource.includes(normalizedOption) || normalizedOption.includes(normalizedSource)) {
        confidence = Math.max(confidence, 88);
        reason = 'Contains alias tokens';
    }

    return {
        entityType: option.entityType,
        displayName: option.name,
        entityId: option.id,
        confidence,
        reason,
        stage
    };
}

function findSavedMapping(
    mappingType: NameMappingType,
    normalizedSource: string,
    mappings: NameMappingRecord[]
) {
    const exact = mappings.find((item) => item.mappingType === mappingType && item.normalizedSource === normalizedSource);
    if (exact) return exact;

    const containing = mappings.find((item) => {
        if (item.mappingType !== mappingType) return false;
        return normalizedSource.includes(item.normalizedSource) || item.normalizedSource.includes(normalizedSource);
    });

    return containing || null;
}

export function resolveMappedName({
    sourceText,
    mappingType,
    candidates,
    mappings,
    highConfidenceThreshold = 92,
    reviewConfidenceThreshold = 72,
}: {
    sourceText: string;
    mappingType: NameMappingType;
    candidates: MappingTargetOption[];
    mappings: NameMappingRecord[];
    highConfidenceThreshold?: number;
    reviewConfidenceThreshold?: number;
}): MappingResolution {
    const normalizedSource = getCanonicalMappingSource(sourceText, mappingType);

    if (!normalizedSource) {
        return {
            sourceText,
            normalizedSource,
            status: 'unresolved',
            candidates: []
        };
    }

    const exact = candidates.find((option) => normalizeNameMappingSource(option.name) === normalizeNameMappingSource(sourceText));
    if (exact) {
        return {
            sourceText,
            normalizedSource,
            status: 'mapped',
            bestMatch: {
                entityType: exact.entityType,
                displayName: exact.name,
                entityId: exact.id,
                confidence: 100,
                reason: 'Exact master match',
                stage: 'exact'
            },
            candidates: []
        };
    }

    const saved = findSavedMapping(mappingType, normalizedSource, mappings);
    if (saved) {
        return {
            sourceText,
            normalizedSource,
            status: 'mapped',
            bestMatch: {
                entityType: saved.mappedEntityType,
                displayName: saved.mappedDisplayName,
                entityId: saved.mappedEntityId,
                confidence: Math.max(95, Number(saved.confidence || 0)),
                reason: saved.reason || 'Saved mapping memory',
                stage: 'saved_mapping'
            },
            candidates: []
        };
    }

    const ranked = candidates
        .map((option) => rankCandidate(sourceText, option))
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 8);

    const bestMatch = ranked[0];
    if (bestMatch && bestMatch.confidence >= highConfidenceThreshold) {
        return {
            sourceText,
            normalizedSource,
            status: 'mapped',
            bestMatch,
            candidates: ranked.slice(1)
        };
    }

    if (bestMatch && bestMatch.confidence >= reviewConfidenceThreshold) {
        return {
            sourceText,
            normalizedSource,
            status: 'review',
            bestMatch,
            candidates: ranked
        };
    }

    return {
        sourceText,
        normalizedSource,
        status: 'unresolved',
        bestMatch,
        candidates: ranked
    };
}
