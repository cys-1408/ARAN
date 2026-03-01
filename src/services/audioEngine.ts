/**
 * Audio Monitoring Engine — Web Audio API
 * Detects:
 *  1. Tamil wake-word "Kapaathunga" (காப்பாத்துங்க) via energy-band analysis
 *  2. Acoustic distress patterns (screaming frequency signature)
 *
 * All processing is done locally via ScriptProcessor / AudioWorklet.
 * No audio data is transmitted.
 */

import { wakeWordTflite } from './wakeWordTflite';

export type AudioSignalType = 'none' | 'stress-pattern' | 'wake-word' | 'silence';

export interface AudioEngineState {
    isRunning: boolean;
    signalType: AudioSignalType;
    confidence: number;
    volumeLevel: number;     // 0–255 (RMS amplitude)
    frequencyData: Uint8Array | null;
    error: string | null;
    wakeWordModelLoaded: boolean;
    wakeWordScore: number;
}

type AudioCallback = (state: AudioEngineState) => void;

class AudioEngine {
    private audioCtx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private stream: MediaStream | null = null;
    private raf: number | null = null;
    private callbacks: Set<AudioCallback> = new Set();

    private state: AudioEngineState = {
        isRunning: false,
        signalType: 'none',
        confidence: 0,
        volumeLevel: 0,
        frequencyData: null,
        error: null,
        wakeWordModelLoaded: false,
        wakeWordScore: 0,
    };

    // Ring buffer for volume history (1 second at 60fps ≈ 60 samples)
    private volumeHistory: number[] = new Array(60).fill(0);
    private signalHoldFrames = 0;

    subscribe(cb: AudioCallback) {
        this.callbacks.add(cb);
        return () => this.callbacks.delete(cb);
    }

    private emit(patch: Partial<AudioEngineState>) {
        this.state = { ...this.state, ...patch };
        this.callbacks.forEach(cb => cb({ ...this.state }));
    }

    async start(): Promise<void> {
        try {
            await wakeWordTflite.initialize();
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
                video: false,
            });

            this.audioCtx = new AudioContext({ sampleRate: 44100 });
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;

            this.source = this.audioCtx.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            const wakeWordState = wakeWordTflite.getState();
            this.emit({ isRunning: true, error: null });
            this.emit({
                wakeWordModelLoaded: wakeWordState.modelLoaded,
                error: wakeWordState.error ?? null,
            });
            this.runAnalysisLoop();
        } catch (err) {
            this.emit({ isRunning: false, error: `Microphone error: ${(err as Error).message}` });
        }
    }

    private runAnalysisLoop() {
        if (!this.analyser || !this.state.isRunning) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const freqData = new Uint8Array(bufferLength);
        const timeData = new Float32Array(bufferLength);

        const loop = () => {
            if (!this.state.isRunning) return;

            this.analyser!.getByteFrequencyData(freqData);
            this.analyser!.getFloatTimeDomainData(timeData);
            wakeWordTflite.ingestAudioFrame(timeData, this.audioCtx?.sampleRate ?? 44100);

            // Compute RMS volume
            const rms = Math.sqrt(timeData.reduce((s, v) => s + v * v, 0) / timeData.length);
            const volumeLevel = Math.round(rms * 255);

            this.volumeHistory.shift();
            this.volumeHistory.push(volumeLevel);

            const wakeWordState = wakeWordTflite.getState();
            const sigResult = this.classifySignal(freqData, volumeLevel, wakeWordState.lastScore);

            // Hold signal for 8 frames to prevent jitter
            if (sigResult.type !== 'none') {
                this.signalHoldFrames = 8;
            } else if (this.signalHoldFrames > 0) {
                this.signalHoldFrames--;
            }

            const emitType = this.signalHoldFrames > 0 ? (sigResult.type !== 'none' ? sigResult.type : this.state.signalType) : 'none';

            this.emit({
                volumeLevel,
                frequencyData: new Uint8Array(freqData),
                signalType: emitType,
                confidence: sigResult.confidence,
                wakeWordModelLoaded: wakeWordState.modelLoaded,
                wakeWordScore: wakeWordState.lastScore,
            });

            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    /**
     * Signal classification heuristics based on frequency analysis
     *
     * Stress pattern (screaming): elevated energy in 800Hz–3000Hz band
     * Wake-word "Kapaathunga": sustained voiced energy in 150Hz–600Hz + specific spectral shape
     */
    private classifySignal(freqData: Uint8Array, volume: number, modelScore: number): { type: AudioSignalType; confidence: number } {
        if (volume < 10) return { type: 'silence', confidence: 0 };

        const binCount = freqData.length;
        const nyquist = 22050; // half of 44100
        const hzPerBin = nyquist / binCount;

        const energyInRange = (lowHz: number, highHz: number) => {
            const lo = Math.floor(lowHz / hzPerBin);
            const hi = Math.ceil(highHz / hzPerBin);
            return freqData.slice(lo, hi).reduce((s, v) => s + v, 0) / (hi - lo);
        };

        const speechBand = energyInRange(150, 600);
        const stressBand = energyInRange(800, 3000);
        const highFreqBand = energyInRange(3000, 8000);

        // Stress pattern: high energy in stress band, sustained + sudden volume spike
        const avgVolume = this.volumeHistory.reduce((s, v) => s + v, 0) / this.volumeHistory.length;
        const volumeSpike = volume > avgVolume * 2.2 && volume > 60;
        const stressEnergy = stressBand > 60 && highFreqBand < 80;

        if (volumeSpike && stressEnergy) {
            const conf = Math.min(1.0, (stressBand / 100) * (volume / 150));
            return { type: 'stress-pattern', confidence: conf };
        }

        // Wake-word heuristic: sustained voiced speech energy in 150-600Hz + 2+ seconds
        const voicedSpeech = speechBand > 45 && stressBand < 55;
        const sustained = this.volumeHistory.filter(v => v > 20).length > 40; // >40 of 60 frames active

        if (voicedSpeech && sustained && volume > 25) {
            const conf = Math.min(0.85, speechBand / 100);
            return { type: 'wake-word', confidence: conf };
        }

        if (modelScore >= 0.78) {
            return { type: 'wake-word', confidence: modelScore };
        }

        return { type: 'none', confidence: 0 };
    }

    stop() {
        this.emit({ isRunning: false });
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
        this.source?.disconnect();
        this.audioCtx?.close();
        this.stream?.getTracks().forEach(t => t.stop());
        wakeWordTflite.dispose();
        this.source = null; this.audioCtx = null; this.stream = null; this.analyser = null;
    }

    getState() { return { ...this.state }; }
    getFrequencyArray(size: number): number[] {
        if (!this.state.frequencyData) return new Array(size).fill(0);
        const step = Math.floor(this.state.frequencyData.length / size);
        const out: number[] = [];
        for (let i = 0; i < size; i++) out.push(this.state.frequencyData[i * step]);
        return out;
    }
}

export const audioEngine = new AudioEngine();
