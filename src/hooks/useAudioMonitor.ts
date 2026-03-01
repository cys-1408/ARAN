/**
 * useAudioMonitor — Fused Audio Monitor Hook
 *
 * Combines two on-device signal sources:
 *   1. audioEngine — Web Audio API FFT (stress pattern, volume spike)
 *   2. speechEngine — Web Speech API (Tamil wake-word "Kapaathunga")
 *
 * The SOS confidence score is the maximum of both signals so either
 * trigger can independently initiate the intent window.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine, type AudioEngineState } from '../services/audioEngine';
import { speechEngine, type SpeechEngineState } from '../services/speechEngine';
import { sosOrchestrator } from '../services/sosOrchestrator';

export interface FusedAudioState {
    // FFT audio engine
    isRunning: boolean;
    signalType: string;
    volumeLevel: number;
    error: string | null;
    // Speech engine
    speechSupported: boolean;
    speechRunning: boolean;
    speechTranscript: string;
    speechSignal: string;
    speechError: string | null;
    // Fused
    fusedConfidence: number;
    wakeWordModelLoaded: boolean;
    wakeWordScore: number;
}

export function useAudioMonitor(enabled: boolean) {
    const [fftState, setFftState] = useState<AudioEngineState>(audioEngine.getState());
    const [speechState, setSpeechState] = useState<SpeechEngineState>(speechEngine.getState());

    // Start/stop both engines based on `enabled`
    useEffect(() => {
        const unsubFFT = audioEngine.subscribe(setFftState);
        const unsubSpeech = speechEngine.subscribe(setSpeechState);

        if (enabled) {
            audioEngine.start();
            speechEngine.start();
        } else {
            audioEngine.stop();
            speechEngine.stop();
        }

        return () => {
            unsubFFT();
            unsubSpeech();
            audioEngine.stop();
            speechEngine.stop();
        };
    }, [enabled]);

    // Feed fused confidence to SOS orchestrator
    useEffect(() => {
        const fftConf = fftState.confidence;
        const speechConf = speechState.confidence;
        const fusedConf = Math.max(fftConf, speechConf);

        if (fusedConf > 0.3) {
            sosOrchestrator.reportAudioSignal(fusedConf);
        }
    }, [fftState.confidence, speechState.confidence]);

    const getWaveformBars = useCallback((barCount: number): number[] => {
        return audioEngine.getFrequencyArray(barCount);
    }, []);

    const fusedConfidence = Math.max(fftState.confidence, speechState.confidence);

    return {
        // FFT
        isRunning: fftState.isRunning,
        signalType: speechState.signalType !== 'none' ? speechState.signalType : fftState.signalType,
        volumeLevel: fftState.volumeLevel,
        error: fftState.error,
        // Speech
        speechSupported: speechState.isSupported,
        speechRunning: speechState.isRunning,
        speechTranscript: speechState.lastTranscript,
        speechSignal: speechState.signalType,
        speechError: speechState.error,
        // Fused
        fusedConfidence,
        wakeWordModelLoaded: fftState.wakeWordModelLoaded,
        wakeWordScore: fftState.wakeWordScore,
        getWaveformBars,
    };
}
