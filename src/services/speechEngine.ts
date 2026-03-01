/**
 * Speech Engine — Real Web Speech API (SpeechRecognition)
 * Language: Tamil (ta-IN)
 *
 * Listens continuously for the Tamil wake-word "காப்பாத்துங்க" (Kapaathunga)
 * plus common phonetic mis-transcriptions and stress command variants.
 *
 * All recognition is done on-device via the browser's built-in speech engine.
 * No audio data is sent to our servers — the SpeechRecognition API may use
 * the browser vendor's ASR backend (Chrome → Google Speech) but this is
 * standard browser behavior the user grants via microphone permission.
 */

export type SpeechSignalType = 'none' | 'wake-word' | 'help-phrase';

export interface SpeechEngineState {
    isRunning: boolean;
    isSupported: boolean;
    lastTranscript: string;
    signalType: SpeechSignalType;
    confidence: number;
    error: string | null;
}

type SpeechCallback = (state: SpeechEngineState) => void;

// All variant spellings / misrecognitions of "காப்பாத்துங்க"
const WAKE_WORD_PATTERNS = [
    'காப்பாத்துங்க',
    'kapaathunga',
    'kapaatunga',
    'kapaathu',
    'காப்பாத்து',
    'காப்பா',
    'உதவி',           // "udavi" = help
    'help me',
    'save me',
    'உதவுங்கள்',
    'bachao',          // Hindi cross-lang fallback
    'bachao mujhe',
];

// Stress distress phrases (any of these also trigger)
const DISTRESS_PHRASES = [
    'விடுங்க',       // "let me go"
    'விடு',
    'பயமாக இருக்கு',  // "I'm scared"
    'யாரும் வாங்க',   // "someone come"
    'எனக்கு உதவுங்க',
    'let me go',
    'leave me',
    "don't touch me",
    'help',
    'i need help',
    'someone help',
];

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    }

    interface SpeechRecognitionInstance extends EventTarget {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        onstart: (() => void) | null;
        onresult: ((event: SpeechRecognitionEvent) => void) | null;
        onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
        onend: (() => void) | null;
        start(): void;
        stop(): void;
        abort(): void;
    }

    interface SpeechRecognitionEvent extends Event {
        readonly resultIndex: number;
        readonly results: SpeechRecognitionResultList;
    }

    interface SpeechRecognitionResultList {
        readonly length: number;
        item(index: number): SpeechRecognitionResult;
        [index: number]: SpeechRecognitionResult;
    }

    interface SpeechRecognitionResult {
        readonly isFinal: boolean;
        readonly length: number;
        item(index: number): SpeechRecognitionAlternative;
        [index: number]: SpeechRecognitionAlternative;
    }

    interface SpeechRecognitionAlternative {
        readonly transcript: string;
        readonly confidence: number;
    }

    interface SpeechRecognitionErrorEvent extends Event {
        readonly error: string;
        readonly message: string;
    }
}


class SpeechEngine {
    private recognition: SpeechRecognitionInstance | null = null;
    private callbacks: Set<SpeechCallback> = new Set();
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private shouldRun = false;

    private state: SpeechEngineState = {
        isRunning: false,
        isSupported: false,
        lastTranscript: '',
        signalType: 'none',
        confidence: 0,
        error: null,
    };

    constructor() {
        this.state.isSupported = typeof window !== 'undefined' &&
            ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    }

    subscribe(cb: SpeechCallback) {
        this.callbacks.add(cb);
        cb({ ...this.state }); // immediate snapshot
        return () => this.callbacks.delete(cb);
    }

    private emit(patch: Partial<SpeechEngineState>) {
        this.state = { ...this.state, ...patch };
        this.callbacks.forEach(cb => cb({ ...this.state }));
    }

    private buildRecognition(): SpeechRecognitionInstance {
        const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        const r = new SpeechAPI();

        // Tamil primary, with English fallback for "help" phrases
        r.lang = 'ta-IN';
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 5;

        r.onstart = () => {
            this.emit({ isRunning: true, error: null });
        };

        r.onresult = (event: SpeechRecognitionEvent) => {
            // Collect all results from the current session
            let finalText = '';
            let interimText = '';
            let maxConfidence = 0;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];

                // Check all alternatives for each result
                for (let alt = 0; alt < result.length; alt++) {
                    const text = result[alt].transcript.toLowerCase().trim();
                    const conf = result[alt].confidence;
                    maxConfidence = Math.max(maxConfidence, conf || 0.7);

                    if (result.isFinal) {
                        finalText += text + ' ';
                    } else {
                        interimText += text + ' ';
                    }
                }
            }

            const fullText = (finalText || interimText).trim();
            if (!fullText) return;

            this.emit({ lastTranscript: fullText });

            // Check for wake-word hit
            const wakeWordHit = WAKE_WORD_PATTERNS.some(p =>
                fullText.includes(p.toLowerCase())
            );
            const distressHit = DISTRESS_PHRASES.some(p =>
                fullText.includes(p.toLowerCase())
            );

            if (wakeWordHit) {
                this.emit({
                    signalType: 'wake-word',
                    confidence: Math.max(maxConfidence, 0.85),
                });
                // Auto-clear after 3s
                setTimeout(() => this.emit({ signalType: 'none', confidence: 0 }), 3000);
            } else if (distressHit) {
                this.emit({
                    signalType: 'help-phrase',
                    confidence: Math.max(maxConfidence, 0.75),
                });
                setTimeout(() => this.emit({ signalType: 'none', confidence: 0 }), 3000);
            }
        };

        r.onerror = (event: SpeechRecognitionErrorEvent) => {
            const ignoreable = ['no-speech', 'aborted'];
            if (ignoreable.includes(event.error)) return;
            this.emit({ error: `Speech error: ${event.error}`, isRunning: false });
        };

        r.onend = () => {
            this.emit({ isRunning: false });
            // Auto-restart if we should still be running
            if (this.shouldRun) {
                this.restartTimer = setTimeout(() => {
                    if (this.shouldRun) this.startInternal();
                }, 500);
            }
        };

        return r;
    }

    private startInternal() {
        try {
            this.recognition = this.buildRecognition();
            this.recognition.start();
        } catch (err) {
            this.emit({ error: (err as Error).message, isRunning: false });
        }
    }

    start() {
        if (!this.state.isSupported) {
            this.emit({ error: 'SpeechRecognition API not supported in this browser.' });
            return;
        }
        if (this.shouldRun) return;
        this.shouldRun = true;
        this.startInternal();
    }

    stop() {
        this.shouldRun = false;
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
        this.recognition?.abort();
        this.recognition = null;
        this.emit({ isRunning: false, signalType: 'none', confidence: 0 });
    }

    getState() { return { ...this.state }; }
    isSupported() { return this.state.isSupported; }
}

export const speechEngine = new SpeechEngine();
