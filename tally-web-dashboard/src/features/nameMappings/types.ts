export type NameMappingType = 'party' | 'item' | 'bank_party';
export type MappedEntityType = 'ledger' | 'stock_item';
export type MappingStatus = 'approved' | 'suggested';
export type MappingStage = 'exact' | 'saved_mapping' | 'prefix' | 'fuzzy' | 'manual' | 'created' | 'unresolved';

export interface NameMappingRecord {
    id?: string;
    $id?: string;
    userId: string;
    clientId: string;
    mappingType: NameMappingType;
    sourceText: string;
    normalizedSource: string;
    mappedEntityType: MappedEntityType;
    mappedEntityId?: string;
    mappedDisplayName: string;
    confidence: number;
    status: MappingStatus;
    reason?: string;
    createdAt: string;
    updatedAt: string;
    lastUsedAt: string;
}

export interface MappingCandidate {
    entityType: MappedEntityType;
    displayName: string;
    entityId?: string;
    confidence: number;
    reason: string;
    stage: MappingStage;
}

export interface MappingResolution {
    sourceText: string;
    normalizedSource: string;
    status: 'mapped' | 'review' | 'unresolved';
    bestMatch?: MappingCandidate;
    candidates: MappingCandidate[];
}

export interface MappingTargetOption {
    id?: string;
    name: string;
    entityType: MappedEntityType;
}
