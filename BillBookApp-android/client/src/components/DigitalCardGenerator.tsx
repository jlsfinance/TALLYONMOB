import React, { useState, useRef, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Share2, Building2, Phone, Mail, MapPin, Edit2, Palette, RefreshCw, Sparkles, Download, AlertTriangle, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { HapticService } from '@/services/hapticService';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
import { AIService } from '@/services/aiService';

interface DigitalCardGeneratorProps {
    onClose: () => void;
}

// --- CONFIGURATION ---
const BACKGROUNDS = [
    { id: 'slate', style: { background: '#0f172a' }, text: 'text-white' },
    { id: 'white', style: { background: '#ffffff' }, text: 'text-slate-900' },
    { id: 'indigo', style: { background: '#312e81' }, text: 'text-white' },
    { id: 'black', style: { background: '#000000' }, text: 'text-white' },
    { id: 'gradient-1', style: { background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' }, text: 'text-white' },
    { id: 'gradient-2', style: { background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)' }, text: 'text-white' },
    { id: 'gradient-3', style: { background: 'linear-gradient(135deg, #065f46 0%, #0d9488 100%)' }, text: 'text-white' },
    { id: 'gradient-4', style: { background: 'linear-gradient(135deg, #be123c 0%, #db2777 100%)' }, text: 'text-white' },
    { id: 'gradient-5', style: { background: 'linear-gradient(90deg, #f59e0b 0%, #ea580c 100%)' }, text: 'text-white' },
    { id: 'gradient-6', style: { background: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)' }, text: 'text-white' },
    { id: 'gradient-7', style: { background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)' }, text: 'text-white' },
    { id: 'gradient-8', style: { background: 'linear-gradient(90deg, #0f172a 0%, #581c87 50%, #0f172a 100%)' }, text: 'text-white' },
];

const ACCENTS = [
    { id: 'amber', hex: '#fbbf24' },
    { id: 'indigo', hex: '#6366f1' },
    { id: 'rose', hex: '#f43f5e' },
    { id: 'emerald', hex: '#10b981' },
    { id: 'cyan', hex: '#22d3ee' },
    { id: 'white', hex: '#ffffff' },
];

const LAYOUTS = [
    { id: 'classic', name: 'Classic' },
    { id: 'modern', name: 'Modern' },
    { id: 'minimal', name: 'Minimal' },
    { id: 'center', name: 'Centered' },
    { id: 'split', name: 'Split' },
    { id: 'border', name: 'Bordered' },
];

export const DigitalCardGenerator: React.FC<DigitalCardGeneratorProps> = ({ onClose }) => {
    const { company } = useCompany();
    const { user } = useAuth();
    const cardRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [apiKeyError, setApiKeyError] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // --- STATE ---
    const [mode, setMode] = useState<'VIEW' | 'EDIT' | 'STYLE'>('VIEW');
    const [layout, setLayout] = useState('classic');
    const [bg, setBg] = useState(BACKGROUNDS[4]);
    const [accent, setAccent] = useState(ACCENTS[0]);

    // Editable Data
    const [cardData, setCardData] = useState({
        name: '',
        owner: '',
        phone: '',
        email: '',
        address: '',
        gst: '',
        tagline: ''
    });

    // Initialize Data
    // Initialize Data & Check API Key
    useEffect(() => {
        setCardData({
            name: company?.name || 'Your Company',
            owner: user?.displayName || 'Proprietor',
            phone: company?.phone || '+91 98765 43210',
            email: company?.email || 'email@example.com',
            address: company?.address || 'City, India',
            gst: company?.gst || '',
            tagline: 'Premium Services'
        });

        const key = AIService.getApiKey();
        if (!key || key.length < 10) {
            setApiKeyError(true);
        } else {
            setApiKeyError(false);
        }
    }, [company, user]);

    const handleAiGenerate = async () => {
        if (apiKeyError) {
            alert("Please set a valid Gemini API Key in Settings first.");
            return;
        }

        setIsAiLoading(true);
        HapticService.medium();

        try {
            const apiKey = AIService.getApiKey();
            const prompt = `You are a professional graphic designer. 
            Generate a creative tagline and suggest a color theme concept for a business card.
            
            Business Name: ${cardData.name}
            Owner: ${cardData.owner}
            Type: Professional Business
            
            Return ONLY a JSON object:
            {
                "tagline": "string (max 5 words, catchy)",
                "suggestedLayout": "one of: classic, modern, minimal, center, split, border",
                "primaryColor": "#hexcode (vibrant, modern)",
                "reasoning": "short reason"
            }`;

            // Use User Requested Model: gemini-3-flash-preview
            let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            // Fallback to Gemini 1.5 Pro if Gemini 3 is not available
            if (!response.ok) {
                console.warn("Gemini 3 Flash not available, falling back to Gemini 1.5 Pro");
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });
            }

            if (!response.ok) throw new Error("AI Generation Failed");

            const data = await response.json();
            const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            // Clean markdown if present
            const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);

            setCardData(prev => ({ ...prev, tagline: parsed.tagline }));

            // Map layout suggestion
            const suggestedLayout = LAYOUTS.find(l => l.id === parsed.suggestedLayout);
            if (suggestedLayout) setLayout(suggestedLayout.id);

            // Apply AI Suggested Color
            if (parsed.primaryColor) {
                setAccent({ id: 'ai-custom', hex: parsed.primaryColor });
            } else {
                setAccent(ACCENTS[Math.floor(Math.random() * ACCENTS.length)]);
            }

            // Randomize Background for freshness
            setBg(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);

            HapticService.success();
        } catch (error: any) {
            console.error(error);
            alert(`AI Error: ${error.message || 'Unknown error'}`);
            HapticService.error();
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!cardRef.current || isGenerating) return;
        setIsGenerating(true);
        HapticService.light();

        try {
            const canvas = await html2canvas(cardRef.current, {
                scale: 3,
                backgroundColor: null,
                useCORS: true,
                logging: false,
                allowTaint: true
            });

            const base64Data = canvas.toDataURL('image/png');
            const fileName = `business_card_${Date.now()}.png`;

            if (Capacitor.isNativePlatform()) {
                await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents
                });
                alert('Image saved to Documents!');
            } else {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = base64Data;
                link.click();
            }
            HapticService.success();
        } catch (error: any) {
            console.error('Download failed:', error);
            alert(`Download Error: ${error.message || 'Unknown'}`);
            HapticService.error();
        } finally {
            setIsGenerating(false);
        }
    };

    const handleShare = async () => {
        if (!cardRef.current || isGenerating) return;
        setIsGenerating(true);
        HapticService.light();

        try {
            const canvas = await html2canvas(cardRef.current, {
                scale: 3,
                backgroundColor: null,
                useCORS: true,
                logging: false,
                allowTaint: true
            });

            const base64Data = canvas.toDataURL('image/png');
            const fileName = `business_card_${Date.now()}.png`;

            if (Capacitor.isNativePlatform()) {
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data.split(',')[1],
                    directory: Directory.Cache
                });

                await Share.share({
                    title: 'My Business Card',
                    text: `Visit ${cardData.name}! Contact: ${cardData.phone}`,
                    url: result.uri,
                });
            } else {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = base64Data;
                link.click();
            }
            HapticService.success();
        } catch (error) {
            console.error('Generation failed:', error);
            alert('Could not generate card. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    // --- RENDER COMPONENTS ---

    const EditorPanel = () => (
        <div className="p-4 space-y-3 overflow-y-auto max-h-[40vh]">
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Company Name</label>
                <input
                    type="text"
                    value={cardData.name}
                    onChange={e => setCardData({ ...cardData, name: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm font-bold"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tagline</label>
                <input
                    type="text"
                    value={cardData.tagline}
                    onChange={e => setCardData({ ...cardData, tagline: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Owner Name</label>
                    <input
                        type="text"
                        value={cardData.owner}
                        onChange={e => setCardData({ ...cardData, owner: e.target.value })}
                        className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phone</label>
                    <input
                        type="text"
                        value={cardData.phone}
                        onChange={e => setCardData({ ...cardData, phone: e.target.value })}
                        className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm"
                    />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                <input
                    type="text"
                    value={cardData.email}
                    onChange={e => setCardData({ ...cardData, email: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Address</label>
                <input
                    type="text"
                    value={cardData.address}
                    onChange={e => setCardData({ ...cardData, address: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm"
                />
            </div>
        </div>
    );

    const StylePanel = () => (
        <div className="p-4 space-y-6 overflow-y-auto max-h-[40vh]">
            {/* Layouts */}
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Layout</label>
                <div className="grid grid-cols-3 gap-2">
                    {LAYOUTS.map(l => (
                        <button
                            key={l.id}
                            onClick={() => { setLayout(l.id); HapticService.light(); }}
                            className={`p-2 rounded-xl text-xs font-bold border-2 transition-all ${layout === l.id ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-100 text-slate-500'}`}
                        >
                            {l.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Backgrounds */}
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Background</label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {BACKGROUNDS.map((b, i) => (
                        <button
                            key={i}
                            onClick={() => { setBg(b); HapticService.light(); }}
                            className={`w-10 h-10 rounded-full shrink-0 shadow-sm ${bg.id === b.id ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                            style={b.style}
                        />
                    ))}
                </div>
            </div>

            {/* Accents */}
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Accent Color</label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {ACCENTS.map((a, i) => (
                        <button
                            key={i}
                            onClick={() => { setAccent(a); HapticService.light(); }}
                            className={`w-10 h-10 rounded-full shrink-0 shadow-sm ${accent.id === a.id ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                            style={{ backgroundColor: a.hex }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    // --- CARD RENDERING ---
    const RenderCard = () => (
        <div ref={cardRef} className="relative w-[340px] h-[200px] shrink-0 shadow-2xl overflow-hidden transition-all duration-500" style={bg.style}>
            {/* Background Pattern Overlay - CSS Only */}
            <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
                backgroundSize: '16px 16px'
            }}></div>
            <div className="absolute inset-0 opacity-5" style={{
                background: 'linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.1) 50%, transparent 50%, transparent 75%, rgba(255,255,255,0.1) 75%, rgba(255,255,255,0.1))',
                backgroundSize: '20px 20px'
            }}></div>

            {/* --- LAYOUT: CLASSIC --- */}
            {layout === 'classic' && (
                <div className="p-6 h-full flex flex-col justify-between relative">
                    <div className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-bl-full" style={{ backgroundColor: accent.hex }} />

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl shadow-lg ${bg.id === 'white' ? 'text-white' : 'text-slate-900'}`} style={{ backgroundColor: accent.hex }}>
                                {cardData.name.charAt(0)}
                            </div>
                            <div>
                                <h2 className={`text-xl font-black leading-tight ${bg.text}`}>{cardData.name}</h2>
                                <p className={`text-[9px] font-bold uppercase tracking-wider opacity-70 ${bg.text}`}>{cardData.tagline}</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 space-y-1.5 pl-1">
                        <div className="h-0.5 w-12 mb-3 rounded-full" style={{ backgroundColor: accent.hex }} />
                        <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3" style={{ color: accent.hex }} />
                            <span className={`text-[10px] font-medium ${bg.text}`}>{cardData.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" style={{ color: accent.hex }} />
                            <span className={`text-[10px] font-medium ${bg.text}`}>{cardData.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" style={{ color: accent.hex }} />
                            <span className={`text-[10px] font-medium ${bg.text}`}>{cardData.address}</span>
                        </div>
                    </div>

                    <div className={`absolute bottom-4 right-6 text-right`}>
                        <p className={`text-sm font-bold ${bg.text}`}>{cardData.owner}</p>
                        <p className={`text-[8px] opacity-60 uppercase ${bg.text}`}>Proprietor</p>
                    </div>
                </div>
            )}

            {/* --- LAYOUT: MODERN --- */}
            {layout === 'modern' && (
                <div className="h-full flex relative">
                    <div className="w-1/3 h-full relative overflow-hidden flex flex-col items-center justify-center p-4 text-center" style={{ backgroundColor: accent.hex }}>
                        <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mb-3">
                            <span className="text-3xl font-black text-white">{cardData.name.charAt(0)}</span>
                        </div>
                        <p className="text-white text-[10px] font-bold opacity-80 uppercase tracking-widest leading-relaxed">{cardData.tagline}</p>
                    </div>
                    <div className="flex-1 p-5 flex flex-col justify-center gap-3">
                        <div>
                            <h2 className={`text-2xl font-black uppercase tracking-tighter ${bg.text}`}>{cardData.name}</h2>
                            <p className="text-xs font-bold" style={{ color: accent.hex }}>{cardData.owner}</p>
                        </div>
                        <div className="space-y-1.5 border-l-2 border-slate-200 pl-3">
                            <p className={`text-[10px] font-bold ${bg.text}`}>{cardData.phone}</p>
                            <p className={`text-[10px] opacity-70 ${bg.text}`}>{cardData.email}</p>
                            <p className={`text-[10px] opacity-70 leading-tight ${bg.text}`}>{cardData.address}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LAYOUT: MINIMAL --- */}
            {layout === 'minimal' && (
                <div className="h-full p-6 flex flex-col items-center justify-center text-center relative border-4 border-double border-white/10">
                    <div className="absolute inset-4 border opacity-30 rounded-lg" style={{ borderColor: accent.hex }} />

                    <h2 className={`text-2xl font-black tracking-widest uppercase mb-1 ${bg.text}`}>{cardData.name}</h2>
                    <div className="w-8 h-1 rounded-full mb-4" style={{ backgroundColor: accent.hex }} />

                    <p className={`text-sm font-bold mb-4 ${bg.text}`}>{cardData.owner}</p>

                    <div className="flex gap-3 justify-center">
                        <span className={`text-[9px] font-mono opacity-80 ${bg.text}`}>{cardData.phone}</span>
                        <span className={`text-[9px] font-mono opacity-50 ${bg.text}`}>|</span>
                        <span className={`text-[9px] font-mono opacity-80 ${bg.text}`}>{cardData.email}</span>
                    </div>
                </div>
            )}

            {/* --- LAYOUT: CENTER --- */}
            {layout === 'center' && (
                <div className="h-full p-4 flex flex-col items-center justify-center relative">
                    <div className="absolute top-0 w-full h-1/2 skew-y-6 -translate-y-12 opacity-90" style={{ backgroundColor: accent.hex }} />

                    <div className={`relative z-10 w-20 h-20 rounded-2xl shadow-xl flex items-center justify-center mb-4 ${bg.id === 'white' ? 'bg-slate-900' : 'bg-white'}`}>
                        <Building2 className={`w-10 h-10 ${bg.id === 'white' ? 'text-white' : 'text-slate-900'}`} />
                    </div>

                    <h2 className={`text-xl font-black relative z-10 mb-1 ${bg.text}`}>{cardData.name}</h2>
                    <p className={`text-[9px] font-bold uppercase tracking-widest relative z-10 opacity-70 mb-4 ${bg.text}`}>{cardData.tagline}</p>

                    <div className={`flex flex-wrap justify-center gap-2 relative z-10 ${bg.id === 'white' ? 'bg-slate-50' : 'bg-white/10'} p-3 rounded-xl`}>
                        <div className="flex items-center gap-1 px-2 py-1 rounded text-white text-[9px] font-bold" style={{ backgroundColor: accent.hex }}>
                            <Phone className="w-3 h-3" /> {cardData.phone}
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded bg-slate-200 text-slate-800 text-[9px] font-bold`}>
                            <span className="truncate max-w-[120px]">{cardData.address}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LAYOUT: SPLIT --- */}
            {layout === 'split' && (
                <div className="h-full w-full grid grid-cols-2">
                    <div className="p-4 flex flex-col justify-end items-start" style={{ backgroundColor: accent.hex }}>
                        <Building2 className="w-12 h-12 text-black/20 mb-auto" />
                        <h2 className="text-2xl font-black text-white leading-none mb-1">{cardData.name}</h2>
                        <div className="h-1 w-12 bg-black/20 rounded-full" />
                    </div>
                    <div className="p-4 flex flex-col justify-center space-y-2">
                        <div className="text-right">
                            <p className={`text-xs font-bold ${bg.text}`}>{cardData.owner}</p>
                            <p className={`text-[8px] opacity-60 uppercase ${bg.text}`}>Owner</p>
                        </div>
                        <div className="h-px w-full bg-slate-200 dark:bg-slate-700 my-2" />
                        <div className="space-y-1 text-[9px] font-medium opacity-80">
                            <p className={`${bg.text}`}>{cardData.phone}</p>
                            <p className={`${bg.text}`}>{cardData.email}</p>
                            <p className={`${bg.text}`}>{cardData.address}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LAYOUT: BORDER --- */}
            {layout === 'border' && (
                <div className={`h-full w-full p-3`}>
                    <div className="h-full w-full border-[3px] rounded-xl flex flex-col items-center justify-center relative" style={{ borderColor: accent.hex }}>
                        <div className={`absolute top-0 bg-white dark:bg-slate-900 px-4 -translate-y-1/2`}>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: accent.hex }}>{cardData.tagline}</span>
                        </div>

                        <h2 className={`text-3xl font-black text-center mb-2 ${bg.text}`}>{cardData.name}</h2>
                        <p className={`text-xs font-bold mb-6 ${bg.text}`}>— {cardData.owner} —</p>

                        <div className={`w-full bg-slate-100 dark:bg-slate-800 py-3 flex justify-around`}>
                            <div className="text-center">
                                <Phone className="w-4 h-4 mx-auto mb-1" style={{ color: accent.hex }} />
                                <p className={`text-[8px] font-bold ${bg.text}`}>{cardData.phone}</p>
                            </div>
                            <div className="text-center">
                                <MapPin className="w-4 h-4 mx-auto mb-1" style={{ color: accent.hex }} />
                                <p className={`text-[8px] font-bold ${bg.text}`}>Location</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-black">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 p-4 pt-safe flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X className="w-6 h-6 text-slate-800 dark:text-white" />
                    </button>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">Card Designer</h2>
                        <p className="text-xs text-slate-500">Fully Customizable</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleAiGenerate}
                        disabled={isAiLoading || apiKeyError}
                        className={`px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${apiKeyError ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white active:scale-95'
                            }`}
                    >
                        {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {isAiLoading ? 'Creating...' : 'Create with AI'}
                    </button>

                    <button
                        onClick={handleShare}
                        disabled={isGenerating}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-full font-bold text-xs shadow-lg shadow-indigo-500/30 flex items-center gap-2 active:scale-95 transition-all"
                    >
                        {isGenerating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Share2 className="w-3 h-3" /> Share</>}
                    </button>
                </div>
            </div>

            {/* API Error Banner */}
            {apiKeyError && (
                <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2 flex items-center gap-2 justify-center border-b border-amber-100 dark:border-amber-800">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        Gemini API Key missing! AI features are disabled. Please add it in Settings.
                    </p>
                </div>
            )}

            {/* Main Preview Area */}
            <div className="flex-1 flex items-center justify-center p-8 bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <motion.div
                    layout
                    className="shadow-2xl rounded-lg overflow-hidden ring-4 ring-white dark:ring-slate-800 transform-style-3d"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                >
                    <RenderCard />
                </motion.div>
            </div>

            {/* Bottom Controls */}
            <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">

                {/* Download Button Row */}
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-center">
                    <button
                        onClick={handleDownload}
                        disabled={isGenerating}
                        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        <Download className="w-3 h-3" /> Download as Image
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-800">
                    <button
                        onClick={() => setMode('VIEW')}
                        className={`flex-1 py-4 flex flex-col items-center gap-1 ${mode === 'VIEW' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
                    >
                        <RefreshCw className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Templates</span>
                    </button>
                    <button
                        onClick={() => setMode('STYLE')}
                        className={`flex-1 py-4 flex flex-col items-center gap-1 ${mode === 'STYLE' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
                    >
                        <Palette className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Style</span>
                    </button>
                    <button
                        onClick={() => setMode('EDIT')}
                        className={`flex-1 py-4 flex flex-col items-center gap-1 ${mode === 'EDIT' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
                    >
                        <Edit2 className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">Edit Text</span>
                    </button>
                </div>

                {/* Content Area */}
                <div className="bg-slate-50 dark:bg-black/20 h-[300px]">
                    <AnimatePresence mode='wait'>
                        {mode === 'VIEW' && (
                            <motion.div
                                key="view"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="p-4 grid grid-cols-2 gap-3 overflow-y-auto max-h-full"
                            >
                                {LAYOUTS.map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => { setLayout(l.id); HapticService.light(); }}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${layout === l.id ? 'border-indigo-500 bg-white dark:bg-slate-800 shadow-md transform scale-[1.02]' : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50'}`}
                                    >
                                        <div className="w-full h-12 bg-slate-100 dark:bg-slate-800 rounded mb-2 overflow-hidden relative">
                                            {/* Preview Mockup */}
                                            {l.id === 'split' && <div className="w-1/2 h-full bg-indigo-500" />}
                                            {l.id === 'modern' && <div className="w-1/3 h-full bg-indigo-500" />}
                                            {l.id === 'center' && <div className="w-8 h-8 bg-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" />}
                                            {l.id === 'minimal' && <div className="absolute inset-1 border border-indigo-500/30 rounded" />}
                                        </div>
                                        <p className="text-xs font-bold text-slate-900 dark:text-white">{l.name}</p>
                                    </button>
                                ))}
                            </motion.div>
                        )}

                        {mode === 'STYLE' && (
                            <motion.div
                                key="style"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <StylePanel />
                            </motion.div>
                        )}

                        {mode === 'EDIT' && (
                            <motion.div
                                key="edit"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <EditorPanel />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>
        </div>
    );
};
