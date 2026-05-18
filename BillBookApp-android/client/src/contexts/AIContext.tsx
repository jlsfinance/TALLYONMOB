import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AIKeySetupModal } from '@/components/AIKeySetupModal';
import { AIService } from '../services/aiService';

interface AIContextType {
    isConfigured: boolean;
    showKeySetup: (featureName?: string) => void;
    refreshConfig: () => void;
    apiKey: string | null;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [featureName, setFeatureName] = useState<string | undefined>();
    const [isConfigured, setIsConfigured] = useState(AIService.isConfigured());

    const refreshConfig = () => {
        setIsConfigured(AIService.isConfigured());
    };

    const showKeySetup = (name?: string) => {
        setFeatureName(name);
        setIsModalOpen(true);
    };

    const handleConfigured = () => {
        setIsConfigured(true);
        setIsModalOpen(false);
    };

    // Check config on mount (no polling — events keep it in sync)
    React.useEffect(() => {
        refreshConfig();
    }, []);

    return (
        <AIContext.Provider value={{
            isConfigured,
            showKeySetup,
            refreshConfig,
            apiKey: AIService.getApiKey()
        }}>
            {children}
            <AIKeySetupModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleConfigured}
                featureName={featureName}
            />
        </AIContext.Provider>
    );
};

export const useAI = () => {
    const context = useContext(AIContext);
    if (!context) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
};
