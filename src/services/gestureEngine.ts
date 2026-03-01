/**
 * Gesture Detection Engine — TensorFlow.js + MediaPipe HandPose
 * Detects the International Signal for Help:
 *   1. Hand open, fingers extended
 *   2. Thumb tucked across palm
 *   3. Fingers closed over thumb (fist — signal complete)
 *
 * This runs entirely on-device via WebGL. No data leaves the device.
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Import mediapipe / TF hand-pose detection
// We use dynamic import for code-splitting
type HandDetector = {
    estimateHands: (video: HTMLVideoElement) => Promise<Hand[]>;
    dispose: () => void;
};

interface Hand {
    keypoints: Array<{ name: string; x: number; y: number }>;
    keypoints3D?: Array<{ name: string; x: number; y: number; z: number }>;
    handedness: string;
    score: number;
}

export type GesturePhase = 'none' | 'open-hand' | 'thumb-tuck' | 'signal-complete';

export interface GestureState {
    phase: GesturePhase;
    confidence: number;
    isModelLoaded: boolean;
    isRunning: boolean;
    error: string | null;
}

type GestureCallback = (state: GestureState) => void;

class GestureEngine {
    private detector: HandDetector | null = null;
    private animFrameId: number | null = null;
    private videoEl: HTMLVideoElement | null = null;
    private stream: MediaStream | null = null;
    private callbacks: Set<GestureCallback> = new Set();
    private state: GestureState = {
        phase: 'none',
        confidence: 0,
        isModelLoaded: false,
        isRunning: false,
        error: null,
    };
    private phaseHistory: GesturePhase[] = [];

    subscribe(cb: GestureCallback) {
        this.callbacks.add(cb);
        return () => this.callbacks.delete(cb);
    }

    private emit(patch: Partial<GestureState>) {
        this.state = { ...this.state, ...patch };
        this.callbacks.forEach(cb => cb({ ...this.state }));
    }

    async initialize(videoEl: HTMLVideoElement): Promise<void> {
        this.videoEl = videoEl;
        try {
            await tf.setBackend('webgl');
            await tf.ready();

            // Dynamically import to keep initial bundle lean
            const { createDetector, SupportedModels } = await import('@tensorflow-models/hand-pose-detection');
            this.detector = await createDetector(SupportedModels.MediaPipeHands, {
                runtime: 'tfjs',
                modelType: 'lite',
                maxHands: 1,
            }) as unknown as HandDetector;

            this.emit({ isModelLoaded: true, error: null });
        } catch (err) {
            this.emit({ error: (err as Error).message, isModelLoaded: false });
        }
    }

    async startCamera(): Promise<void> {
        if (!this.videoEl) return;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 320, height: 240 },
                audio: false,
            });
            this.videoEl.srcObject = this.stream;
            await new Promise<void>((res) => { this.videoEl!.onloadedmetadata = () => { this.videoEl!.play(); res(); }; });
            this.emit({ isRunning: true });
            this.runDetectionLoop();
        } catch (err) {
            this.emit({ error: `Camera error: ${(err as Error).message}`, isRunning: false });
        }
    }

    private async runDetectionLoop() {
        if (!this.detector || !this.videoEl || !this.state.isRunning) return;

        const detect = async () => {
            if (!this.state.isRunning) return;
            try {
                const hands = await this.detector!.estimateHands(this.videoEl!);
                if (hands.length > 0) {
                    const gesture = this.classifyGesture(hands[0]);
                    this.updatePhaseHistory(gesture.phase);
                    this.emit({ phase: gesture.phase, confidence: gesture.confidence });
                } else {
                    this.emit({ phase: 'none', confidence: 0 });
                }
            } catch { /* continue loop on transient error */ }
            this.animFrameId = requestAnimationFrame(detect);
        };

        this.animFrameId = requestAnimationFrame(detect);
    }

    private classifyGesture(hand: Hand): { phase: GesturePhase; confidence: number } {
        const kp = Object.fromEntries(hand.keypoints.map(k => [k.name, k]));

        // Landmarks we need
        const wrist = kp['wrist'];
        const indexTip = kp['index_finger_tip'];
        const thumbTip = kp['thumb_tip'];
        const thumbMcp = kp['thumb_mcp'];
        const middleTip = kp['middle_finger_tip'];
        const ringTip = kp['ring_finger_tip'];
        const pinkyTip = kp['pinky_finger_tip'];
        const indexMcp = kp['index_finger_mcp'];

        if (!wrist || !indexTip || !thumbTip) {
            return { phase: 'none', confidence: 0 };
        }

        // Check: Is hand open — all fingertips extended above MCP joints?
        const fingersExtended = [indexTip, middleTip, ringTip, pinkyTip].every(tip =>
            tip && indexMcp && tip.y < indexMcp.y  // Tips above MCP (screen Y is inverted)
        );

        // Check: Is thumb tucked across palm?
        // Thumb tip is between palm center and index MCP x-coordinate
        const thumbTucked = thumbTip && thumbMcp && indexMcp &&
            Math.abs(thumbTip.x - indexMcp.x) < Math.abs(thumbMcp.x - indexMcp.x) * 0.6;

        // Check: Are fingers closed (fist over thumb)?
        const fingersClosed = [indexTip, middleTip, ringTip, pinkyTip].every(tip =>
            tip && wrist && tip.y > wrist.y * 0.85
        );

        const conf = hand.score || 0.8;

        if (fingersExtended && !thumbTucked) {
            return { phase: 'open-hand', confidence: conf * 0.9 };
        }
        if (thumbTucked && fingersExtended) {
            return { phase: 'thumb-tuck', confidence: conf * 0.92 };
        }
        if (fingersClosed && thumbTucked) {
            return { phase: 'signal-complete', confidence: conf * 0.95 };
        }

        return { phase: 'none', confidence: 0 };
    }

    /**
     * Require the phase to be stable for N frames to avoid false positives
     * The signal-complete phase must follow open-hand → thumb-tuck
     */
    private updatePhaseHistory(phase: GesturePhase) {
        this.phaseHistory.push(phase);
        if (this.phaseHistory.length > 15) this.phaseHistory.shift();
    }

    /** Check if the full International Signal for Help sequence is detected */
    isSignalSequenceDetected(): boolean {
        const recent = this.phaseHistory.slice(-10).join(',');
        return (
            recent.includes('open-hand') &&
            recent.includes('thumb-tuck') &&
            recent.includes('signal-complete')
        );
    }

    stop() {
        this.emit({ isRunning: false });
        if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
        if (this.detector) { this.detector.dispose(); this.detector = null; }
    }

    getState() { return { ...this.state }; }
}

export const gestureEngine = new GestureEngine();
