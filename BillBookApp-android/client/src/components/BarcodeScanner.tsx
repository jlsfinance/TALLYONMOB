/**
 * Barcode & QR Code Scanner Component
 * Uses camera to scan product barcodes and QR codes
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Flashlight, RotateCcw, Scan, Package } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (code: string, format: string) => void;
    title?: string;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
    isOpen,
    onClose,
    onScan,
    title = 'Scan Barcode/QR',
}) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [flashOn, setFlashOn] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            startScanner();
        } else {
            stopScanner();
        }

        return () => {
            stopScanner();
        };
    }, [isOpen]);

    const startScanner = async () => {
        if (!containerRef.current) return;

        try {
            setError(null);
            setIsScanning(true);

            const scanner = new Html5Qrcode('barcode-scanner-container');
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' }, // Use back camera
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                },
                (decodedText, decodedResult) => {
                    // Success callback
                    const format = decodedResult.result.format?.formatName || 'UNKNOWN';
                    console.log(`[Scanner] Scanned: ${decodedText} (${format})`);

                    setLastScanned(decodedText);
                    onScan(decodedText, format);

                    // Optional: Stop after successful scan
                    // stopScanner();
                },
                (_errorMessage) => {
                    // Error callback (usually just "no code found" - ignore)
                    // console.log('[Scanner] Error:', _errorMessage);
                }
            );
        } catch (err: any) {
            console.error('[Scanner] Failed to start:', err);
            setError(err.message || 'Failed to access camera');
            setIsScanning(false);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                const state = scannerRef.current.getState();
                if (state === Html5QrcodeScannerState.SCANNING) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (err) {
                console.error('[Scanner] Stop error:', err);
            }
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    const handleRestart = async () => {
        await stopScanner();
        setLastScanned(null);
        await startScanner();
    };

    const toggleFlash = async () => {
        // Note: Flash control requires additional implementation
        // depending on the browser/device support
        setFlashOn(!flashOn);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] bg-black flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500 flex items-center justify-center">
                            <Scan className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold">{title}</h2>
                            <p className="text-white/60 text-xs">Point camera at barcode</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/10 text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scanner Container */}
                <div className="flex-1 relative">
                    <div
                        id="barcode-scanner-container"
                        ref={containerRef}
                        className="w-full h-full"
                    />

                    {/* Overlay Frame */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative">
                            <div className="w-64 h-64 border-2 border-white/30 rounded-3xl" />
                            {/* Corner accents */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-2xl" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-2xl" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-2xl" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-2xl" />

                            {/* Scanning line animation */}
                            {isScanning && (
                                <motion.div
                                    className="absolute left-4 right-4 h-0.5 bg-blue-500 shadow-lg shadow-blue-500/50"
                                    animate={{
                                        top: ['10%', '90%', '10%'],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: 'linear',
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Error State */}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                            <div className="text-center p-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <Camera className="w-8 h-8 text-red-500" />
                                </div>
                                <p className="text-white font-bold mb-2">Camera Error</p>
                                <p className="text-white/60 text-sm mb-4">{error}</p>
                                <button
                                    onClick={handleRestart}
                                    className="px-6 py-3 bg-blue-500 text-white rounded-xl font-bold"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6">
                    {/* Last Scanned */}
                    {lastScanned && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-4 border border-white/20"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                                    <Package className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white/60 text-xs">Last Scanned</p>
                                    <p className="text-white font-bold truncate">{lastScanned}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={toggleFlash}
                            className={`p-4 rounded-full ${flashOn ? 'bg-yellow-500' : 'bg-white/20'} transition-colors`}
                        >
                            <Flashlight className={`w-6 h-6 ${flashOn ? 'text-white' : 'text-white/80'}`} />
                        </button>

                        <button
                            onClick={handleRestart}
                            className="p-4 rounded-full bg-white/20"
                        >
                            <RotateCcw className="w-6 h-6 text-white/80" />
                        </button>
                    </div>

                    <p className="text-center text-white/40 text-xs mt-4">
                        Supports Barcode, QR Code, EAN, UPC
                    </p>
                </div>
            </div>
        </AnimatePresence>
    );
};

export default BarcodeScanner;
