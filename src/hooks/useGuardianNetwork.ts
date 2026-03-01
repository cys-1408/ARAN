/**
 * useGuardianNetwork — React hook for WebRTC guardian channel
 * Wraps guardianChannel service with React state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    guardianChannel,
    type GuardianState,
    type GuardianMessage,
    type LocationPing,
} from '../services/guardianChannel';

export interface GuardianNetworkState {
    guardian: GuardianState;
    locationHistory: LocationPing[];
    lastPing: LocationPing | null;
    sessionId: string;
}

export function useGuardianNetwork() {
    const [state, setState] = useState<GuardianNetworkState>({
        guardian: guardianChannel.getState(),
        locationHistory: [],
        lastPing: null,
        sessionId: guardianChannel.getSessionId(),
    });

    useEffect(() => {
        const unsubState = guardianChannel.subscribeState((gs) =>
            setState(s => ({ ...s, guardian: gs }))
        );
        const unsubMsg = guardianChannel.subscribeMessages((msg: GuardianMessage) => {
            if (msg.type === 'location') {
                setState(s => ({
                    ...s,
                    lastPing: msg,
                    locationHistory: [...s.locationHistory.slice(-99), msg],
                }));
            }
        });
        return () => { unsubState(); unsubMsg(); };
    }, []);

    const startTracking = useCallback(async (displayName?: string) => {
        await guardianChannel.startAsSender(displayName);
    }, []);

    const startGuarding = useCallback(async (displayName?: string) => {
        await guardianChannel.startAsGuardian(displayName);
    }, []);

    const sendLocation = useCallback((coords: GeolocationCoordinates, commitmentHex?: string) => {
        guardianChannel.sendLocation(coords, commitmentHex);
    }, []);

    const sendSOSActive = useCallback(() => {
        guardianChannel.send({ type: 'sos-active' });
    }, []);

    const sendSafe = useCallback((message?: string) => {
        guardianChannel.send({ type: 'safe', message });
    }, []);

    const disconnect = useCallback(() => {
        guardianChannel.disconnect();
        setState(s => ({ ...s, locationHistory: [], lastPing: null }));
    }, []);

    return {
        ...state,
        startTracking,
        startGuarding,
        sendLocation,
        sendSOSActive,
        sendSafe,
        disconnect,
    };
}
