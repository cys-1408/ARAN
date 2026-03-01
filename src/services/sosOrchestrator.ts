import type { SOSTrigger, AlertEvent, EmergencyContact, GuardianVolunteer } from '../types';
import { dispatchSOS, type DispatchPayload } from './dispatchService';
import { commitLocation, generateZKPShadowLink, generateGroth16LocationProof } from './zkpEngine';
import { routeSOSAlertToGuardians } from './guardianDispatch';

type SOSPhase = 'idle' | 'detecting' | 'intent-window' | 'confirmed' | 'dispatched' | 'cancelled';

export interface SOSEngineState {
    phase: SOSPhase;
    trigger: SOSTrigger | null;
    confidence: number;
    heartRateBpm: number | null;
    intentCountdown: number | null;
    commitmentHex?: string;
    shadowLink?: string;
    guardians: GuardianVolunteer[];
    groth16ProofGenerated: boolean;
}

export interface SOSEventHandlers {
    onPhaseChange: (state: SOSEngineState) => void;
    onAlertDispatched: (event: AlertEvent) => void;
    onCancelled: () => void;
}

export interface SOSContext {
    contacts: EmergencyContact[];
    userName: string;
    latitude: number | null;
    longitude: number | null;
}

const CONFIDENCE_THRESHOLD = 0.72;
const MULTI_SIGNAL_BOOST = 0.15;
const INTENT_WINDOW_DURATION = 5;
const DISPATCH_DELAY = 800;

class SOSOrchestrator {
    private state: SOSEngineState = {
        phase: 'idle',
        trigger: null,
        confidence: 0,
        heartRateBpm: null,
        intentCountdown: null,
        guardians: [],
        groth16ProofGenerated: false,
    };
    private handlers: SOSEventHandlers | null = null;
    private context: SOSContext = {
        contacts: [],
        userName: 'ARAN User',
        latitude: null,
        longitude: null,
    };
    private intentTimer: ReturnType<typeof setInterval> | null = null;
    private dispatchTimer: ReturnType<typeof setTimeout> | null = null;
    private audioSignalActive = false;
    private gestureSignalActive = false;

    init(handlers: SOSEventHandlers) {
        this.handlers = handlers;
    }

    updateContext(ctx: Partial<SOSContext>) {
        this.context = { ...this.context, ...ctx };
    }

    private emit() {
        this.handlers?.onPhaseChange({ ...this.state });
    }

    private transition(phase: SOSPhase, overrides: Partial<Omit<SOSEngineState, 'phase'>> = {}) {
        this.state = { ...this.state, phase, ...overrides };
        this.emit();
    }

    reportGestureSignal(confidence: number) {
        this.gestureSignalActive = confidence > 0.5;
        this.evaluateSignals('gesture', confidence);
    }

    reportAudioSignal(confidence: number) {
        this.audioSignalActive = confidence > 0.5;
        this.evaluateSignals('audio', confidence);
    }

    reportHeartRate(bpm: number) {
        this.state.heartRateBpm = bpm;
        if (bpm > 115 && this.state.phase === 'detecting') {
            this.evaluateSignals(this.state.trigger || 'wearable', this.state.confidence + 0.12);
        }
    }

    private evaluateSignals(trigger: SOSTrigger, rawConfidence: number) {
        if (this.state.phase !== 'idle' && this.state.phase !== 'detecting') return;
        const multiSignal = this.audioSignalActive && this.gestureSignalActive;
        const confidence = Math.min(1.0, rawConfidence + (multiSignal ? MULTI_SIGNAL_BOOST : 0));
        this.transition('detecting', { trigger, confidence });
        if (confidence >= CONFIDENCE_THRESHOLD) {
            this.beginIntentWindow(trigger, confidence);
        }
    }

    private beginIntentWindow(trigger: SOSTrigger, confidence: number) {
        this.clearTimers();
        this.triggerHapticHandshake();
        this.transition('intent-window', { trigger, confidence, intentCountdown: INTENT_WINDOW_DURATION });

        let remaining = INTENT_WINDOW_DURATION;
        this.intentTimer = setInterval(() => {
            remaining -= 1;
            this.state.intentCountdown = remaining;
            this.emit();
            if (remaining <= 0) {
                this.clearTimers();
                this.confirmSOS(trigger, confidence);
            }
        }, 1000);
    }

    cancelIntent() {
        if (this.state.phase !== 'intent-window' && this.state.phase !== 'confirmed') return;
        this.clearTimers();
        this.transition('cancelled', { intentCountdown: null });
        this.handlers?.onCancelled();
        setTimeout(() => this.reset(), 2000);
    }

    triggerManual() {
        if (this.state.phase !== 'idle') return;
        this.beginIntentWindow('manual', 1.0);
    }

    private confirmSOS(trigger: SOSTrigger, confidence: number) {
        this.transition('confirmed', { trigger, confidence, intentCountdown: null });
        this.dispatchTimer = setTimeout(() => {
            this.dispatchSOS(trigger, confidence);
        }, DISPATCH_DELAY);
    }

    private async dispatchSOS(trigger: SOSTrigger, confidence: number) {
        const { contacts, userName, latitude, longitude } = this.context;
        let commitmentHex: string | undefined;
        let shadowLink: string | undefined;
        let groth16ProofGenerated = false;

        if (latitude !== null && longitude !== null) {
            try {
                const commitment = await commitLocation(latitude, longitude, 0.1);
                commitmentHex = commitment.commitmentHex;
                shadowLink = generateZKPShadowLink(commitment);
                await generateGroth16LocationProof(latitude, longitude).catch(() => null);
                groth16ProofGenerated = true;
            } catch {
                // Continue with dispatch even if commitment creation fails.
            }
        }

        const guardians = await routeSOSAlertToGuardians(latitude, longitude);

        const event: AlertEvent = {
            id: `a-${Date.now()}`,
            type: 'sos',
            trigger,
            timestamp: new Date().toISOString(),
            location: latitude !== null && longitude !== null
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : 'Location unavailable',
            status: 'active',
            cancelled: false,
        };

        this.transition('dispatched', { trigger, confidence, commitmentHex, shadowLink, guardians, groth16ProofGenerated });
        this.handlers?.onAlertDispatched(event);

        if (contacts.length > 0) {
            const payload: DispatchPayload = {
                contacts,
                userName,
                latitude,
                longitude,
                trigger,
                commitmentHash: commitmentHex,
            };
            dispatchSOS(payload).catch(err => console.error('[ARAN] Dispatch error:', err));
        }
    }

    private triggerHapticHandshake() {
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100, 50, 100, 200, 300, 200, 300, 200, 300, 200, 100, 50, 100, 50, 100]);
        }
    }

    private clearTimers() {
        if (this.intentTimer) { clearInterval(this.intentTimer); this.intentTimer = null; }
        if (this.dispatchTimer) { clearTimeout(this.dispatchTimer); this.dispatchTimer = null; }
    }

    reset() {
        this.clearTimers();
        this.gestureSignalActive = false;
        this.audioSignalActive = false;
        this.state = {
            phase: 'idle',
            trigger: null,
            confidence: 0,
            heartRateBpm: null,
            intentCountdown: null,
            guardians: [],
            groth16ProofGenerated: false,
        };
        this.emit();
    }

    getState(): SOSEngineState { return { ...this.state }; }
    getPhase(): SOSPhase { return this.state.phase; }
}

export const sosOrchestrator = new SOSOrchestrator();
