/**
 * Sound Service - Audio Feedback for User Actions
 * Provides pleasant audio feedback for save, delete, and other operations
 */

class SoundServiceClass {
    private audioContext: AudioContext | null = null;

    constructor() {
        // Initialize AudioContext on user interaction
        if (typeof window !== 'undefined') {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    /**
     * Play a success sound (sweet melody for save)
     */
    playSuccess() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;

        // Create oscillator for melody
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Sweet ascending melody (C5 -> E5 -> G5)
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5

        osc.type = 'sine';

        // Envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
    }

    /**
     * Play a delete sound (descending tone)
     */
    playDelete() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Descending tone (G4 -> D4)
        osc.frequency.setValueAtTime(392.00, now); // G4
        osc.frequency.exponentialRampToValueAtTime(293.66, now + 0.2); // D4

        osc.type = 'triangle';

        // Envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.start(now);
        osc.stop(now + 0.25);
    }

    /**
     * Play error sound
     */
    playError() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Error tone (harsh descending)
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);

        osc.type = 'sawtooth';

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.start(now);
        osc.stop(now + 0.18);
    }

    /**
     * Play notification sound (subtle ping)
     */
    playNotification() {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        osc.frequency.setValueAtTime(800, now);
        osc.type = 'sine';

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    /**
     * Ensure AudioContext is resumed (required by some browsers)
     */
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}

export const SoundService = new SoundServiceClass();
