/**
 * Gesture Detection Engine — TensorFlow.js + MediaPipe HandPose
 *
 * Detects the International Signal for Help (3-phase sequence):
 *   Phase 1 — Open Hand:       All 4 fingers fully extended
 *   Phase 2 — Thumb Tuck:      Thumb folds across the palm interior
 *   Phase 3 — Signal Complete: Four fingers close over the tucked thumb (fist)
 *
 * ⚠️  COORDINATE SPACE:
 *   MediaPipe Hands with runtime:'tfjs' returns NORMALIZED coordinates [0,1].
 *   • (0,0) = top-left,  (1,1) = bottom-right of video frame
 *   • y increases DOWNWARD
 *   • Finger extended   → tip.y < pip.y   (tip is HIGHER / smaller y number)
 *   • Finger curled     → tip.y > pip.y   (tip is LOWER  / bigger  y number)
 *   Margins must be in normalized units, NOT pixels.
 *
 * Sequence enforcement:
 *   - 45-frame history (~1.5 s @ 30 fps)
 *   - Each phase stable for ≥ 3 consecutive frames before it counts
 *   - Strict order: open-hand → thumb-tuck → signal-complete
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// ─── Hand detection types ─────────────────────────────────────────────────────

type HandDetector = {
    estimateHands: (
        input: HTMLVideoElement,
        config?: { flipHorizontal?: boolean }
    ) => Promise<Hand[]>;
    dispose: () => void;
};

// MediaPipe keypoint — x,y are normalized [0,1] when using tfjs runtime
interface Hand {
    keypoints: Array<{ name: string; x: number; y: number }>;
    keypoints3D?: Array<{ name: string; x: number; y: number; z: number }>;
    handedness: 'Left' | 'Right' | string;
    score: number;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type GesturePhase = 'none' | 'open-hand' | 'thumb-tuck' | 'signal-complete';

export interface GestureState {
    phase: GesturePhase;
    confidence: number;
    isModelLoaded: boolean;
    isRunning: boolean;
    error: string | null;
}

type GestureCallback = (state: GestureState) => void;

// ─── Landmark names (MediaPipe 21-point hand model) ──────────────────────────

const LM = {
    WRIST: 'wrist',
    THUMB_CMC: 'thumb_cmc',
    THUMB_MCP: 'thumb_mcp',
    THUMB_IP: 'thumb_ip',
    THUMB_TIP: 'thumb_tip',
    INDEX_MCP: 'index_finger_mcp',
    INDEX_PIP: 'index_finger_pip',
    INDEX_DIP: 'index_finger_dip',
    INDEX_TIP: 'index_finger_tip',
    MIDDLE_MCP: 'middle_finger_mcp',
    MIDDLE_PIP: 'middle_finger_pip',
    MIDDLE_DIP: 'middle_finger_dip',
    MIDDLE_TIP: 'middle_finger_tip',
    RING_MCP: 'ring_finger_mcp',
    RING_PIP: 'ring_finger_pip',
    RING_TIP: 'ring_finger_tip',
    PINKY_MCP: 'pinky_finger_mcp',
    PINKY_PIP: 'pinky_finger_pip',
    PINKY_TIP: 'pinky_finger_tip',
} as const;

// Normalized margin for extension/curl checks (5% of frame height)
const EXTEND_MARGIN = 0.05;
const CURL_MARGIN = 0.05;

// ─── Engine ───────────────────────────────────────────────────────────────────

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
    private confirmedPhases: GesturePhase[] = [];
    private consecutiveCount = 0;
    private lastRawPhase: GesturePhase = 'none';

    private static readonly HISTORY_LEN = 45;
    private static readonly STABLE_FRAMES = 3;

    // ── Subscribe ─────────────────────────────────────────────────────────────

    subscribe(cb: GestureCallback) {
        this.callbacks.add(cb);
        cb({ ...this.state });
        return () => this.callbacks.delete(cb);
    }

    private emit(patch: Partial<GestureState>) {
        this.state = { ...this.state, ...patch };
        this.callbacks.forEach(cb => cb({ ...this.state }));
    }

    // ── Initialize ────────────────────────────────────────────────────────────

    async initialize(videoEl: HTMLVideoElement): Promise<void> {
        this.videoEl = videoEl;
        try {
            try { await tf.setBackend('webgl'); await tf.ready(); }
            catch { await tf.setBackend('cpu'); await tf.ready(); }

            const { createDetector, SupportedModels } = await import(
                '@tensorflow-models/hand-pose-detection'
            );

            this.detector = (await createDetector(SupportedModels.MediaPipeHands, {
                runtime: 'tfjs',    // uses @tensorflow/tfjs — no CDN needed
                modelType: 'lite',
                maxHands: 1,
            })) as unknown as HandDetector;

            this.emit({ isModelLoaded: true, error: null });
            console.log('[GestureEngine] MediaPipe HandPose model loaded (tfjs runtime)');
        } catch (err) {
            this.emit({
                isModelLoaded: false,
                error: `Hand model load error: ${(err as Error).message}`,
            });
            console.error('[GestureEngine] init error:', err);
        }
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    async startCamera(): Promise<void> {
        if (!this.videoEl) return;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });
            const v = this.videoEl;
            v.srcObject = this.stream;
            await new Promise<void>((res, rej) => {
                v.onloadedmetadata = () => v.play().then(res).catch(rej);
                v.onerror = rej;
            });
            this.emit({ isRunning: true });
            this.runDetectionLoop();
        } catch (err) {
            this.emit({ isRunning: false, error: `Camera: ${(err as Error).message}` });
        }
    }

    // ── Detection loop ────────────────────────────────────────────────────────

    private runDetectionLoop() {
        if (!this.detector || !this.videoEl) return;

        const detect = async () => {
            if (!this.state.isRunning) return;
            if (this.videoEl!.readyState >= 2) {
                try {
                    // Note: flipHorizontal mirrors the selfie view so hand directions match UI
                    const hands = await this.detector!.estimateHands(this.videoEl!, {
                        flipHorizontal: true,
                    });
                    if (hands.length > 0) {
                        const { phase, confidence } = this.classifyGesture(hands[0]);
                        this.trackPhase(phase, confidence);
                    } else {
                        this.trackPhase('none', 0);
                    }
                } catch (e) {
                    console.debug('[GestureEngine] frame error:', e);
                }
            }
            this.animFrameId = requestAnimationFrame(detect);
        };

        this.animFrameId = requestAnimationFrame(detect);
    }

    // ── Gesture classification ────────────────────────────────────────────────

    private classifyGesture(hand: Hand): { phase: GesturePhase; confidence: number } {
        // Build named landmark map
        const kp = new Map<string, { x: number; y: number }>();
        for (const pt of hand.keypoints) kp.set(pt.name, pt);

        const g = (name: string) => kp.get(name);

        // Fetch all landmarks we need
        const wrist = g(LM.WRIST);
        const thumbTip = g(LM.THUMB_TIP);
        const thumbMcp = g(LM.THUMB_MCP);
        const thumbIp = g(LM.THUMB_IP);
        const indexMcp = g(LM.INDEX_MCP);
        const indexPip = g(LM.INDEX_PIP);
        const indexTip = g(LM.INDEX_TIP);
        const middleMcp = g(LM.MIDDLE_MCP);
        const middlePip = g(LM.MIDDLE_PIP);
        const middleTip = g(LM.MIDDLE_TIP);
        const ringPip = g(LM.RING_PIP);
        const ringTip = g(LM.RING_TIP);
        const pinkyPip = g(LM.PINKY_PIP);
        const pinkyTip = g(LM.PINKY_TIP);

        // ⚠️ NaN Guard: MediaPipe can return NaN coordinates when keypoints fail
        if (!wrist || !thumbTip || !thumbMcp || !thumbIp ||
            !indexMcp || !indexPip || !indexTip ||
            !middleMcp || !middlePip || !middleTip ||
            !ringPip || !ringTip || !pinkyPip || !pinkyTip) {
            return { phase: 'none', confidence: 0 };
        }

        // NaN validation: check all required points have valid coordinates
        const isValidPoint = (p: { x: number; y: number }) => 
            !Number.isNaN(p.x) && !Number.isNaN(p.y) && 
            Number.isFinite(p.x) && Number.isFinite(p.y);

        const requiredPoints = [
            wrist, thumbTip, thumbMcp, thumbIp,
            indexMcp, indexPip, indexTip,
            middleMcp, middlePip, middleTip,
            ringPip, ringTip, pinkyPip, pinkyTip
        ];

        if (!requiredPoints.every(isValidPoint)) {
            console.debug('[GestureEngine] Invalid coordinates detected (NaN/Infinity), skipping frame');
            return { phase: 'none', confidence: 0 };
        }

        // Additional safety: check coordinates are within normalized range [0,1]
        const isInRange = (p: { x: number; y: number }) =>
            p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

        if (!requiredPoints.every(isInRange)) {
            console.debug('[GestureEngine] Coordinates out of [0,1] range, skipping frame');
            return { phase: 'none', confidence: 0 };
        }

        const conf = Math.max(0.5, hand.score ?? 0.8);

        // ── Phase 1: Open Hand ────────────────────────────────────────────────
        // In NORMALIZED coords: extended = tip.y < pip.y (tip is higher in frame)
        // Use EXTEND_MARGIN = 0.05 (5% of frame height in normalized units)
        // Enhanced with relative distance checks for robustness
        const extd = (tip: { y: number }, pip: { y: number }) => {
            const diff = pip.y - tip.y;
            return diff > EXTEND_MARGIN;
        };

        const indexExtd = extd(indexTip, indexPip);
        const middleExtd = extd(middleTip, middlePip);
        const ringExtd = extd(ringTip, ringPip);
        const pinkyExtd = extd(pinkyTip, pinkyPip);
        const allFingersExtended = indexExtd && middleExtd && ringExtd && pinkyExtd;

        // Enhanced logging with coordinate validation status
        if (process.env.NODE_ENV === 'development' && allFingersExtended) {
            console.debug('[Gesture] Open Hand detected | index:', indexExtd,
                'tip.y:', indexTip.y.toFixed(3), 'pip.y:', indexPip.y.toFixed(3),
                'diff:', (indexPip.y - indexTip.y).toFixed(3));
        }

        // ── Phase 2: Thumb Tuck ───────────────────────────────────────────────
        // Thumb tip moves to the INTERIOR of the palm.
        // Palm center ≈ average x of index_mcp and middle_mcp
        // "Tucked" = thumb_tip is significantly closer to palette center than thumb_mcp
        const palmCenterX = (indexMcp.x + middleMcp.x) / 2;
        const tipToCenterX = Math.abs(thumbTip.x - palmCenterX);
        const mcpToCenterX = Math.abs(thumbMcp.x - palmCenterX);

        // Also check that thumb tip is at a similar y to index MCP (crossed inward)
        const thumbCrossedInward = tipToCenterX < mcpToCenterX * 0.65;
        // Thumb IP should be bent (thumb_tip y > thumb_ip y means it's folded down)
        const thumbBent = thumbTip.y > thumbIp.y - 0.03;
        const thumbTucked = thumbCrossedInward && thumbBent;

        // ── Phase 3: Signal Complete (Fist) ───────────────────────────────────
        // All fingers curled: tip.y > pip.y (tip is LOWER / larger y than pip)
        const curled = (tip: { y: number }, pip: { y: number }) =>
            tip.y > pip.y + CURL_MARGIN;

        const indexCurled = curled(indexTip, indexPip);
        const middleCurled = curled(middleTip, middlePip);
        const ringCurled = curled(ringTip, ringPip);
        const pinkyCurled = curled(pinkyTip, pinkyPip);
        const allFingersCurled = indexCurled && middleCurled && ringCurled && pinkyCurled;

        // ── Resolve to a single phase (mutually exclusive, priority: fist > tuck > open) ──
        if (allFingersCurled && thumbTucked) {
            return { phase: 'signal-complete', confidence: conf * 0.95 };
        }
        if (thumbTucked && !allFingersCurled) {
            return { phase: 'thumb-tuck', confidence: conf * 0.92 };
        }
        if (allFingersExtended && !thumbTucked) {
            return { phase: 'open-hand', confidence: conf * 0.90 };
        }

        return { phase: 'none', confidence: 0 };
    }

    // ── Phase stability tracking ──────────────────────────────────────────────

    private trackPhase(raw: GesturePhase, confidence: number) {
        if (raw === this.lastRawPhase) {
            this.consecutiveCount++;
        } else {
            this.lastRawPhase = raw;
            this.consecutiveCount = 1;
        }

        this.phaseHistory.push(raw);
        if (this.phaseHistory.length > GestureEngine.HISTORY_LEN) this.phaseHistory.shift();

        // Commit to confirmedPhases only when stable
        if (this.consecutiveCount === GestureEngine.STABLE_FRAMES && raw !== 'none') {
            this.confirmedPhases.push(raw);
            if (this.confirmedPhases.length > 6) this.confirmedPhases.splice(0, 1);
            console.log('[GestureEngine] Stable phase committed:', raw);
        }

        // Reset when hand disappears for >20 frames
        const recentNoneCount = this.phaseHistory.slice(-20).filter(p => p === 'none').length;
        if (recentNoneCount > 15) this.confirmedPhases = [];

        const stablePhase = this.consecutiveCount >= GestureEngine.STABLE_FRAMES ? raw : this.state.phase;
        this.emit({ phase: stablePhase, confidence: stablePhase !== 'none' ? confidence : 0 });
    }

    // ── Sequence detection ────────────────────────────────────────────────────

    /**
     * True when open-hand → thumb-tuck → signal-complete appear IN ORDER
     * among the stably-confirmed phases (each held for ≥ 3 frames).
     */
    isSignalSequenceDetected(): boolean {
        const seq: GesturePhase[] = ['open-hand', 'thumb-tuck', 'signal-complete'];
        let idx = 0;
        for (const p of this.confirmedPhases) {
            if (p === seq[idx]) { idx++; if (idx === seq.length) return true; }
        }
        return false;
    }

    // ── Teardown ──────────────────────────────────────────────────────────────

    stop() {
        this.emit({ isRunning: false, phase: 'none', confidence: 0 });
        if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
        this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
        this.detector?.dispose(); this.detector = null;
        this.phaseHistory = []; this.confirmedPhases = [];
        this.consecutiveCount = 0; this.lastRawPhase = 'none';
    }

    getState(): GestureState { return { ...this.state }; }
}

export const gestureEngine = new GestureEngine();
