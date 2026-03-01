import React, { useState, useEffect } from 'react';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { EmergencyFAB } from './EmergencyFAB';
import { IntentVerificationModal } from './IntentVerificationModal';
import { SOSActiveOverlay } from './SOSActiveOverlay';
import { sosOrchestrator, type SOSEngineState } from '../../services/sosOrchestrator';
import { useApp } from '../../contexts/AppContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import styles from './AppShell.module.css';

interface AppShellProps {
    children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
    const { state, dispatch } = useApp();
    const [sosEngineState, setSOSEngineState] = useState<SOSEngineState>(sosOrchestrator.getState());

    // Real geolocation for SOS dispatch
    const { position } = useGeolocation({ blur: false, watch: true });

    // Keep orchestrator context updated with real GPS + contacts
    useEffect(() => {
        sosOrchestrator.updateContext({
            contacts: state.emergencyContacts,
            userName: state.user?.name ?? 'ARAN User',
            latitude: position?.coords.latitude ?? null,
            longitude: position?.coords.longitude ?? null,
        });
    }, [position, state.emergencyContacts, state.user?.name]);

    useEffect(() => {
        sosOrchestrator.init({
            onPhaseChange: (s) => setSOSEngineState(s),
            onAlertDispatched: (event) => {
                dispatch({ type: 'TRIGGER_SOS' });
                dispatch({ type: 'ADD_ALERT', payload: event });
            },
            onCancelled: () => {
                dispatch({ type: 'CANCEL_SOS' });
            },
        });
    }, [dispatch]);

    const handleManualSOS = () => sosOrchestrator.triggerManual();

    const handleCancelIntent = () => {
        sosOrchestrator.cancelIntent();
        dispatch({ type: 'CANCEL_SOS' });
    };

    return (
        <div className={styles.shell}>
            <TopBar />
            <main className={styles.main}>
                {children}
            </main>
            <BottomNav />
            <EmergencyFAB
                onPress={handleManualSOS}
                isActive={state.isSOSActive}
                sosPhase={sosEngineState.phase}
            />
            {sosEngineState.phase === 'intent-window' && (
                <IntentVerificationModal
                    countdown={sosEngineState.intentCountdown ?? 5}
                    trigger={sosEngineState.trigger}
                    onCancel={handleCancelIntent}
                />
            )}
            {state.isSOSActive && sosEngineState.phase === 'dispatched' && (
                <SOSActiveOverlay
                    contacts={state.emergencyContacts}
                    commitmentHex={sosEngineState.commitmentHex}
                    shadowLink={sosEngineState.shadowLink}
                    guardians={sosEngineState.guardians}
                    latitude={position?.coords.latitude ?? null}
                    longitude={position?.coords.longitude ?? null}
                    onDismiss={() => {
                        dispatch({ type: 'CANCEL_SOS' });
                        sosOrchestrator.reset();
                    }}
                />
            )}
        </div>
    );
}
