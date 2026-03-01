import { useState } from 'react';
import { Siren } from 'lucide-react';
import styles from './EmergencyFAB.module.css';

type SOSPhase = 'idle' | 'detecting' | 'intent-window' | 'confirmed' | 'dispatched' | 'cancelled';

interface Props {
    onPress: () => void;
    isActive: boolean;
    sosPhase: SOSPhase;
}

export function EmergencyFAB({ onPress, isActive, sosPhase }: Props) {
    const [pressed, setPressed] = useState(false);

    const handlePress = () => {
        setPressed(true);
        setTimeout(() => setPressed(false), 200);
        onPress();
    };

    const isIntentWindow = sosPhase === 'intent-window';
    const isDispatched = sosPhase === 'dispatched';

    return (
        <div className={styles.fabContainer}>
            {(isActive || isIntentWindow) && (
                <>
                    <div className={styles.pulseRing} style={{ animationDelay: '0ms' }} />
                    <div className={styles.pulseRing} style={{ animationDelay: '600ms' }} />
                </>
            )}
            <button
                className={[
                    styles.fab,
                    isActive || isDispatched ? styles.fabActive : '',
                    isIntentWindow ? styles.fabIntentWindow : '',
                    pressed ? styles.fabPressed : '',
                ].join(' ')}
                onClick={handlePress}
                aria-label={isActive ? 'SOS Active — tap to manage' : 'Trigger Emergency SOS'}
                aria-pressed={isActive}
                id="emergency-sos-fab"
            >
                <Siren
                    size={28}
                    strokeWidth={2}
                    className={isActive ? styles.iconActive : styles.icon}
                />
                <span className={styles.fabLabel}>SOS</span>
            </button>
        </div>
    );
}
