import { useEffect, useRef, useState } from 'react';
import { gestureEngine, type GestureState } from '../services/gestureEngine';
import { sosOrchestrator } from '../services/sosOrchestrator';

export function useGestureDetection(enabled: boolean, videoRef: React.RefObject<HTMLVideoElement | null>) {
    const [state, setState] = useState<GestureState>(gestureEngine.getState());
    const initializedRef = useRef(false);

    useEffect(() => {
        if (!enabled) {
            gestureEngine.stop();
            initializedRef.current = false;
            return;
        }

        const unsub = gestureEngine.subscribe((s) => {
            setState(s);
            if (s.phase === 'signal-complete' && s.confidence > 0.65) {
                if (gestureEngine.isSignalSequenceDetected()) {
                    sosOrchestrator.reportGestureSignal(s.confidence);
                }
            }
        });

        const init = async () => {
            if (videoRef.current && !initializedRef.current) {
                initializedRef.current = true;
                await gestureEngine.initialize(videoRef.current);
                await gestureEngine.startCamera();
            }
        };
        init();

        return () => { unsub(); gestureEngine.stop(); initializedRef.current = false; };
    }, [enabled, videoRef]);

    return state;
}
