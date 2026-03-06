/**
 * useGestureDetection — Production-Ready Hook
 *
 * Manages the GestureEngine lifecycle tied to a video element ref.
 * Handles:
 *   - Lazy initialization once the video element is actually mounted
 *   - Clean teardown on disable or unmount
 *   - SOS orchestrator integration on confirmed signal sequence
 */

import { useEffect, useRef, useState } from 'react';
import { gestureEngine, type GestureState } from '../services/gestureEngine';
import { sosOrchestrator } from '../services/sosOrchestrator';

export function useGestureDetection(
    enabled: boolean,
    videoRef: React.RefObject<HTMLVideoElement | null>
) {
    const [state, setState] = useState<GestureState>(gestureEngine.getState());
    const initializedRef = useRef(false);
    const sosReportedRef = useRef(false); // prevent duplicate SOS triggers

    useEffect(() => {
        if (!enabled) {
            gestureEngine.stop();
            initializedRef.current = false;
            sosReportedRef.current = false;
            return;
        }

        // Subscribe first so we don't miss any state updates during init
        const unsub = gestureEngine.subscribe((s) => {
            setState(s);

            // Fire SOS only once per confirmed sequence; reset when hand leaves frame
            if (
                s.phase === 'signal-complete' &&
                s.confidence > 0.65 &&
                !sosReportedRef.current &&
                gestureEngine.isSignalSequenceDetected()
            ) {
                sosReportedRef.current = true;
                sosOrchestrator.reportGestureSignal(s.confidence);
                // Allow re-trigger after 8 seconds
                setTimeout(() => { sosReportedRef.current = false; }, 8000);
            }
        });

        const init = async () => {
            if (initializedRef.current) return;

            // Wait for the video element to be available in the DOM
            const el = videoRef.current;
            if (!el) {
                // Retry after a short tick — React may not have committed yet
                const retryTimer = setTimeout(init, 200);
                return () => clearTimeout(retryTimer);
            }

            initializedRef.current = true;
            await gestureEngine.initialize(el);
            await gestureEngine.startCamera();
        };

        init();

        return () => {
            unsub();
            gestureEngine.stop();
            initializedRef.current = false;
            sosReportedRef.current = false;
        };
    }, [enabled, videoRef]);

    return state;
}
