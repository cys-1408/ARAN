import { useState, useEffect, useMemo } from 'react';
import { X, Shield } from 'lucide-react';
import type { SOSTrigger } from '../../types';
import styles from './IntentVerificationModal.module.css';

interface Props {
    countdown: number;
    trigger: SOSTrigger | null;
    onCancel: () => void;
}

const TRIGGER_LABELS: Record<string, string> = {
    gesture: 'Hand gesture detected',
    audio: '"Kapaathunga" heard / Stress detected',
    manual: 'Manual SOS button pressed',
    wearable: 'Elevated heart rate detected',
};

export function IntentVerificationModal({ countdown, trigger, onCancel }: Props) {
    const progress = (countdown / 5) * 100;
    const [rhythmHits, setRhythmHits] = useState<number[]>([]);

    const rhythmRemaining = useMemo(() => {
        const now = Date.now();
        return rhythmHits.filter((ts) => now - ts <= 2500).length;
    }, [rhythmHits]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isVolumeKey = event.code === 'AudioVolumeUp' || event.code === 'AudioVolumeDown';
            const isFallbackKey = event.code === 'ArrowUp' || event.code === 'ArrowDown';
            if (!isVolumeKey && !isFallbackKey) return;

            const now = Date.now();
            setRhythmHits((current) => {
                const next = [...current.filter((ts) => now - ts <= 2500), now];
                if (next.length >= 3) onCancel();
                return next;
            });
        };

        window.addEventListener('keydown', handler, { passive: true });
        return () => window.removeEventListener('keydown', handler);
    }, [onCancel]);

    return (
        <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="SOS Intent Verification">
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.sosIcon}>
                        <Shield size={32} />
                    </div>
                    <div className={styles.headerText}>
                        <h2 className={styles.title}>SOS Detected</h2>
                        <p className={styles.trigger}>{trigger ? TRIGGER_LABELS[trigger] : 'Signal detected'}</p>
                    </div>
                </div>

                <div className={styles.countdownSection}>
                    <div className={styles.countdownRing}>
                        <svg viewBox="0 0 80 80" className={styles.ringsvg}>
                            <circle cx="40" cy="40" r="34" className={styles.ringTrack} />
                            <circle
                                cx="40" cy="40" r="34"
                                className={styles.ringFill}
                                strokeDasharray={`${2 * Math.PI * 34}`}
                                strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
                            />
                        </svg>
                        <span className={styles.countdownNum}>{countdown}</span>
                    </div>
                    <p className={styles.countdownLabel}>Sending SOS in</p>
                </div>

                <p className={styles.description}>
                    ARAN has detected an emergency signal. Your emergency contacts and nearby guardians will be alerted with your location.
                    <br /><br />
                    <strong>If this was accidental, cancel below.</strong>
                </p>

                <div className={styles.actions}>
                    <button
                        className="btn btn-outline"
                        onClick={onCancel}
                        autoFocus
                        id="intent-cancel-btn"
                    >
                        <X size={16} />
                        Cancel — It's Safe
                    </button>
                </div>

                <p className={styles.hint}>
                    <span className={styles.hintIcon}>📳</span>
                    Haptic handshake active. Press volume-up/down rhythm 3 times in 2.5s to cancel ({rhythmRemaining}/3).
                </p>
            </div>
        </div>
    );
}
