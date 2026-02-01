
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { GeminiService } from '../services/geminiService';
import { AdminAd } from '../types';
import { Trash2, Sparkles, Wand2, X } from 'lucide-react';
import { HapticService } from '../services/hapticService';
import { AIService } from '../services/aiService';

interface AdminAdsManagerProps {
    onClose: () => void;
}

export const AdminAdsManager: React.FC<AdminAdsManagerProps> = ({ onClose }) => {
    const [ads, setAds] = useState<AdminAd[]>([]);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setAds(StorageService.getAdminAds());
    }, []);

    const saveAds = (newAds: AdminAd[]) => {
        setAds(newAds);
        StorageService.saveAdminAds(newAds);
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete this update?")) {
            saveAds(ads.filter(a => a.id !== id));
        }
    };

    const handleGenerate = async () => {
        if (!aiPrompt) return;
        setIsGenerating(true);
        try {
            // Use hardcoded key or fetch from storage
            const apiKey = AIService.getApiKey();
            if (!apiKey) throw new Error("AI Key not set in Settings");
            const result = await GeminiService.generateUpdateContent(aiPrompt, apiKey);

            const newAd: AdminAd = {
                id: crypto.randomUUID(),
                title: result.title || 'New Update',
                content: result.content || 'Description',
                gradient: result.gradient || 'from-blue-500 to-cyan-500',
                type: (result.type as any) || 'INFO',
                isActive: true
            };

            saveAds([...ads, newAd]);
            setAiPrompt('');
            HapticService.success();
        } catch (e: any) {
            const msg = e instanceof Error ? e.message : 'Unknown Error';
            alert(`AI Generation Failed: ${msg}`);
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-100 dark:bg-slate-900 flex flex-col">
            <div className="p-4 bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-800 dark:text-white">Update Manager</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* AI Generator Section */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5" />
                        <h3 className="font-bold text-lg">Update Generation</h3>
                    </div>
                    <p className="text-sm opacity-90 mb-4">Describe the update you want (e.g. "Diwali Sale 50% off") and AI will design it.</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            placeholder="Enter topic..."
                            className="flex-1 bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder:text-white/60 outline-none focus:bg-white/30 transition-all"
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-transform"
                        >
                            {isGenerating ? <div className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" /> : <Wand2 className="w-5 h-5" />}
                            Generate
                        </button>
                    </div>
                </div>

                {/* Ads List */}
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Active Updates ({ads.length})</h3>
                    {ads.length === 0 && <p className="text-slate-400 text-center py-10">No updates active.</p>}

                    {ads.map(ad => (
                        <div key={ad.id} className="relative group">
                            <div className={`w-full h-32 rounded-[28px] bg-gradient-to-r ${ad.gradient} p-6 flex flex-col justify-center relative overflow-hidden shadow-md`}>
                                <div className="z-10 text-white">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10">{ad.type}</span>
                                    </div>
                                    <h3 className="text-lg font-black leading-tight">{ad.title}</h3>
                                    <p className="text-xs text-blue-100 mt-1 font-semibold opacity-90">{ad.content}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(ad.id)}
                                className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-red-500 hover:text-white rounded-full text-white backdrop-blur-md transition-colors shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
