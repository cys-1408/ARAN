import { useRef, useState, useCallback, useEffect } from 'react';
import {
    Siren, Hand, Mic, Heart, Phone, PlayCircle, StopCircle,
    Shield, AlertTriangle, Clock, Vibrate, Bluetooth, BluetoothOff, MessageSquare
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useGestureDetection } from '../hooks/useGestureDetection';
import { useAudioMonitor } from '../hooks/useAudioMonitor';
import { sosOrchestrator } from '../services/sosOrchestrator';
import { bluetoothHRM, type BtHRState } from '../services/bluetoothHeartRate';
import { webHidHeartRate, type HidHRState } from '../services/webHidHeartRate';
import styles from './SOSPage.module.css';

type FakeCallState = 'idle' | 'ringing' | 'active';

const CALLER_NAMES = ['Amma', 'Kavitha', 'Meena', 'Anna', 'Vijaya'];
const SIGNAL_SEQUENCE = [
    { phase: 'open-hand', label: 'Open Hand', emoji: '✋', desc: 'Extend all fingers toward camera' },
    { phase: 'thumb-tuck', label: 'Tuck Thumb', emoji: '🤜', desc: 'Fold thumb across palm' },
    { phase: 'signal-complete', label: 'Close Fist', emoji: '✊', desc: 'Close fingers over thumb' },
];

function WaveformVisualizer({ bars }: { bars: number[] }) {
    return (
        <div className={styles.waveform} aria-hidden="true">
            {bars.map((h, i) => (
                <div
                    key={i}
                    className="waveform-bar"
                    style={{
                        height: `${Math.max(4, h / 255 * 100)}%`,
                        animationDelay: `${i * 40}ms`,
                        width: '3px',
                    }}
                />
            ))}
        </div>
    );
}

export function SOSPage() {
    const { state, dispatch } = useApp();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [gestureEnabled, setGestureEnabled] = useState(state.safetyPreferences.gestureDetection);
    const [audioEnabled, setAudioEnabled] = useState(state.safetyPreferences.audioMonitoring);
    const [btHRState, setBtHRState] = useState<BtHRState>(bluetoothHRM.getState());
    const [hidState, setHidState] = useState<HidHRState>({
        status: 'disconnected',
        deviceName: null,
        heartRateBpm: null,
        lastReportAt: null,
        error: null
    });
    const [fakeCallState, setFakeCallState] = useState<FakeCallState>('idle');
    const [fakeCallerName] = useState(() => CALLER_NAMES[Math.floor(Math.random() * CALLER_NAMES.length)]);
    const [fakeCallDuration, setFakeCallDuration] = useState(0);
    const btSupported = bluetoothHRM.isSupported();
    const hidSupported = webHidHeartRate.isSupported();

    const gestureState = useGestureDetection(gestureEnabled, videoRef);
    const audioState = useAudioMonitor(audioEnabled);
    const waveformBars = audioState.getWaveformBars(32);

    // Subscribe to real Bluetooth HRM state
    useEffect(() => {
        const unsub = bluetoothHRM.subscribe((s) => {
            setBtHRState(s);
            const bpm = s.heartRateBpm;
            if (bpm !== null) sosOrchestrator.reportHeartRate(bpm);
        });
        return () => { unsub(); };
    }, []);

    useEffect(() => {
        const unsub = webHidHeartRate.subscribe((s) => {
            const legacyState = {
                status: s.connecting ? 'connecting' as const : s.connected ? 'connected' as const : s.error ? 'error' as const : 'disconnected' as const,
                deviceName: s.device?.name || null,
                heartRateBpm: s.lastReading?.bpm || null,
                lastReportAt: s.lastReading?.timestamp || null,
                error: s.error
            };
            setHidState(legacyState);
            if (legacyState.heartRateBpm !== null) sosOrchestrator.reportHeartRate(legacyState.heartRateBpm);
        });
        return () => { unsub(); };
    }, []);

    const toggleBluetooth = useCallback(async () => {
        if (btHRState.status === 'connected') {
            await bluetoothHRM.disconnect();
        } else {
            await bluetoothHRM.requestAndConnect();
        }
    }, [btHRState.status]);

    const toggleHid = useCallback(async () => {
        if (hidState.status === 'connected') {
            webHidHeartRate.disconnect();
        } else {
            await webHidHeartRate.requestAndConnect();
        }
    }, [hidState.status]);

    const triggerFakeCall = useCallback(() => {
        setFakeCallState('ringing');
        setFakeCallDuration(0);
        setTimeout(() => setFakeCallState('active'), 3000);
    }, []);

    const endFakeCall = useCallback(() => {
        setFakeCallState('idle');
        setFakeCallDuration(0);
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval>;
        if (fakeCallState === 'active') {
            timer = setInterval(() => setFakeCallDuration(d => d + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [fakeCallState]);

    const formatDuration = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const handleManualSOS = () => sosOrchestrator.triggerManual();

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                {/* Header */}
                <div className={styles.header}>
                    <h1 className={styles.title}>
                        <Siren size={28} className={styles.titleIcon} />
                        SOS Dashboard
                    </h1>
                    <p className={styles.subtitle}>Multi-modal emergency detection — Edge AI, on-device only</p>
                    <div className={styles.privacyNote}>
                        <Shield size={14} />
                        No audio or video data leaves your device
                    </div>
                </div>

                <div className={styles.grid}>
                    {/* Manual SOS */}
                    <section className={styles.manualSOS}>
                        <button
                            className={styles.sosButton}
                            onClick={handleManualSOS}
                            id="manual-sos-btn"
                            aria-label="Trigger Emergency SOS"
                        >
                            <div className={styles.sosButtonRing1} />
                            <div className={styles.sosButtonRing2} />
                            <div className={styles.sosButtonInner}>
                                <Siren size={48} />
                                <span className={styles.sosButtonLabel}>HOLD FOR SOS</span>
                                <span className={styles.sosButtonSub}>அவசர உதவி</span>
                            </div>
                        </button>
                        <div className={styles.sosHint}>
                            <Vibrate size={14} />
                            5-second intent window will appear. You can cancel.
                        </div>
                    </section>

                    {/* Wearable / Heart Rate via WebHID */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Heart size={18} className={styles.cardIcon} style={{ color: '#f97316' }} />
                                <div>
                                    <h2 className={styles.cardTitle}>WebHID HR Monitor</h2>
                                    <p className={styles.cardSub}>Garmin/Fitbit HID pairing</p>
                                </div>
                            </div>
                            <button
                                className={`btn btn-outline ${styles.wearableBtn}`}
                                onClick={toggleHid}
                                disabled={!hidSupported || hidState.status === 'connecting'}
                                id="hid-toggle-btn"
                            >
                                {hidState.status === 'connected'
                                    ? <><BluetoothOff size={14} /> Disconnect</>
                                    : hidState.status === 'connecting'
                                        ? <>⟳ Connecting…</>
                                        : <><Bluetooth size={14} /> {hidSupported ? 'Pair HID' : 'Not Supported'}</>}
                            </button>
                        </div>

                        {hidState.status === 'connected' && hidState.heartRateBpm !== null ? (
                            <div className={styles.heartRateDisplay}>
                                <div className={styles.btDeviceName}>
                                    <Bluetooth size={12} /> {hidState.deviceName ?? 'HID Device'}
                                </div>
                                <div className={[styles.bpmValue, hidState.heartRateBpm > 115 ? styles.bpmElevated : ''].join(' ')}>
                                    {hidState.heartRateBpm}
                                    <span className={styles.bpmUnit}>BPM</span>
                                </div>
                                <div className={styles.bpmStatus}>
                                    {hidState.heartRateBpm > 115
                                        ? <span className="badge badge-danger">⚠ Elevated - SOS confidence boosted</span>
                                        : <span className="badge badge-safe">Normal range</span>}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.disabledState}>
                                <Heart size={32} className={styles.disabledIcon} />
                                {!hidSupported
                                    ? <span>WebHID not available in this browser</span>
                                    : hidState.error
                                        ? <span style={{ color: 'var(--color-danger)' }}>{hidState.error}</span>
                                        : <span>Pair a compatible HID wearable for HR confidence fusion</span>}
                            </div>
                        )}
                    </section>

                    {/* Gesture Detection */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Hand size={18} className={styles.cardIcon} />
                                <div>
                                    <h2 className={styles.cardTitle}>Hand Gesture Detection</h2>
                                    <p className={styles.cardSub}>International Signal for Help</p>
                                </div>
                            </div>
                            <label className="toggle-switch" title={gestureEnabled ? 'Disable gesture detection' : 'Enable gesture detection'}>
                                <input
                                    type="checkbox"
                                    checked={gestureEnabled}
                                    onChange={e => setGestureEnabled(e.target.checked)}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        {gestureEnabled && (
                            <>
                                <div className={styles.videoWrapper}>
                                    <video
                                        ref={videoRef}
                                        className={styles.videoEl}
                                        autoPlay
                                        muted
                                        playsInline
                                        aria-label="Gesture detection camera feed"
                                    />
                                    <div className={styles.videoOverlay}>
                                        {gestureState.isModelLoaded ? (
                                            <div className={styles.modelStatus}>
                                                <span className="status-dot active"></span>
                                                AI Model Loaded
                                            </div>
                                        ) : (
                                            <div className={styles.modelLoading}>
                                                <span className="animate-spin">⟳</span> Loading TF.js Model...
                                            </div>
                                        )}
                                        {gestureState.error && (
                                            <div className={styles.modelError}>
                                                <AlertTriangle size={12} />
                                                {gestureState.error}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Signal sequence guide */}
                                <div className={styles.signalGuide}>
                                    {SIGNAL_SEQUENCE.map(({ phase, label, emoji, desc }) => (
                                        <div
                                            key={phase}
                                            className={[
                                                styles.signalStep,
                                                gestureState.phase === phase ? styles.signalStepActive : '',
                                            ].join(' ')}
                                        >
                                            <span className={styles.signalEmoji}>{emoji}</span>
                                            <div>
                                                <span className={styles.signalLabel}>{label}</span>
                                                <span className={styles.signalDesc}>{desc}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {gestureState.confidence > 0 && (
                                    <div className={styles.confidenceMeter}>
                                        <span className={styles.confidenceLabel}>Confidence</span>
                                        <div className="progress-bar" style={{ flex: 1 }}>
                                            <div
                                                className="progress-fill"
                                                style={{ width: `${gestureState.confidence * 100}%` }}
                                            />
                                        </div>
                                        <span className={styles.confidenceValue}>
                                            {Math.round(gestureState.confidence * 100)}%
                                        </span>
                                    </div>
                                )}
                            </>
                        )}

                        {!gestureEnabled && (
                            <div className={styles.disabledState}>
                                <Hand size={32} className={styles.disabledIcon} />
                                <span>Gesture detection disabled</span>
                            </div>
                        )}
                    </section>

                    {/* Audio Monitor */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Mic size={18} className={styles.cardIcon} />
                                <div>
                                    <h2 className={styles.cardTitle}>Audio Monitor</h2>
                                    <p className={styles.cardSub}>Wake-word & stress detection</p>
                                </div>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={audioEnabled}
                                    onChange={e => setAudioEnabled(e.target.checked)}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        {audioEnabled && (
                            <>
                                <div className={styles.audioVisualizerWrapper}>
                                    <WaveformVisualizer bars={waveformBars} />
                                    <div className={styles.audioStatus}>
                                        {audioState.isRunning ? (
                                            <><span className="status-dot active"></span>FFT Listening</>
                                        ) : (
                                            <><span className="status-dot inactive"></span>Starting mic...</>
                                        )}
                                        <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span className={`status-dot ${audioState.wakeWordModelLoaded ? 'active' : 'inactive'}`}></span>
                                            TFLite Wake Model {audioState.wakeWordModelLoaded ? 'Loaded' : 'Fallback Mode'}
                                        </span>
                                        {audioState.speechRunning && (
                                            <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span className="status-dot active"></span>Speech API (ta-IN)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Live Tamil speech transcript */}
                                {audioState.speechTranscript && (
                                    <div className={styles.transcriptBox}>
                                        <MessageSquare size={12} />
                                        <span className={styles.transcriptText}>"{audioState.speechTranscript}"</span>
                                    </div>
                                )}

                                <div className={styles.audioSignals}>
                                    <div className={[styles.audioSignalCard,
                                    (audioState.signalType === 'wake-word' || audioState.speechSignal === 'wake-word') ? styles.audioSignalActive : ''
                                    ].join(' ')}>
                                        <span>🎙️</span>
                                        <div>
                                            <span className={styles.audioSignalTitle}>"காப்பாத்துங்க" Wake-word</span>
                                            <span className={styles.audioSignalDesc}>Tamil · TFLite score {Math.round(audioState.wakeWordScore * 100)}% � SpeechRecognition fallback</span>
                                        </div>
                                        {(audioState.speechSignal === 'wake-word') && <span className="badge badge-danger">Detected!</span>}
                                    </div>
                                    <div className={[styles.audioSignalCard, audioState.signalType === 'stress-pattern' ? styles.audioSignalActive : ''].join(' ')}>
                                        <span>📢</span>
                                        <div>
                                            <span className={styles.audioSignalTitle}>Acoustic Stress Pattern</span>
                                            <span className={styles.audioSignalDesc}>FFT · 800Hz–3kHz energy spike</span>
                                        </div>
                                        {audioState.signalType === 'stress-pattern' && <span className="badge badge-danger">Detected!</span>}
                                    </div>
                                    <div className={[styles.audioSignalCard, audioState.speechSignal === 'help-phrase' ? styles.audioSignalActive : ''].join(' ')}>
                                        <span>🆘</span>
                                        <div>
                                            <span className={styles.audioSignalTitle}>Distress Phrase</span>
                                            <span className={styles.audioSignalDesc}>"விடுங்க", "help", "let me go"…</span>
                                        </div>
                                        {audioState.speechSignal === 'help-phrase' && <span className="badge badge-danger">Detected!</span>}
                                    </div>
                                </div>

                                {(audioState.error || audioState.speechError) && (
                                    <div className={styles.audioError}>
                                        <AlertTriangle size={14} />
                                        {audioState.error || audioState.speechError}
                                    </div>
                                )}
                            </>
                        )}

                        {!audioEnabled && (
                            <div className={styles.disabledState}>
                                <Mic size={32} className={styles.disabledIcon} />
                                <span>Audio monitoring disabled</span>
                            </div>
                        )}
                    </section>

                    {/* Wearable / Heart Rate — Real Web Bluetooth GATT */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Heart size={18} className={styles.cardIcon} style={{ color: '#f43f5e' }} />
                                <div>
                                    <h2 className={styles.cardTitle}>BLE Heart Rate Monitor</h2>
                                    <p className={styles.cardSub}>Web Bluetooth GATT · Heart Rate Service 0x180D</p>
                                </div>
                            </div>
                            <button
                                className={`btn btn-outline ${styles.wearableBtn}`}
                                onClick={toggleBluetooth}
                                disabled={!btSupported || btHRState.status === 'connecting'}
                                id="wearable-toggle-btn"
                                title={!btSupported ? 'Web Bluetooth not supported in this browser' : ''}
                            >
                                {btHRState.status === 'connected'
                                    ? <><BluetoothOff size={14} /> Disconnect</>
                                    : btHRState.status === 'connecting'
                                        ? <>⟳ Connecting…</>
                                        : <><Bluetooth size={14} /> {btSupported ? 'Pair Device' : 'Not Supported'}</>}
                            </button>
                        </div>

                        {btHRState.status === 'connected' && btHRState.heartRateBpm !== null ? (
                            <div className={styles.heartRateDisplay}>
                                {btHRState.deviceName && (
                                    <div className={styles.btDeviceName}>
                                        <Bluetooth size={12} /> {btHRState.deviceName}
                                        {btHRState.batteryLevel !== null && <span className="badge badge-muted" style={{ marginLeft: 6 }}>{btHRState.batteryLevel}% 🔋</span>}
                                        {!btHRState.sensorContact && <span className="badge badge-warning" style={{ marginLeft: 6 }}>No Contact</span>}
                                    </div>
                                )}
                                <div className={[styles.bpmValue, btHRState.heartRateBpm > 115 ? styles.bpmElevated : ''].join(' ')}>
                                    {btHRState.heartRateBpm}
                                    <span className={styles.bpmUnit}>BPM</span>
                                </div>
                                {btHRState.rrIntervals.length > 0 && (
                                    <div className={styles.rrRow}>
                                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>RR Interval: {btHRState.rrIntervals[btHRState.rrIntervals.length - 1]}ms</span>
                                    </div>
                                )}
                                <div className={styles.bpmStatus}>
                                    {btHRState.heartRateBpm > 115 ? (
                                        <span className="badge badge-danger">⚠️ Elevated — SOS confidence boosted</span>
                                    ) : (
                                        <span className="badge badge-safe">Normal range</span>
                                    )}
                                </div>
                                <div className={styles.bpmBar}>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{
                                            width: `${Math.min(100, (btHRState.heartRateBpm - 50) / 130 * 100)}%`,
                                            background: btHRState.heartRateBpm > 115 ? '#ef4444' : 'var(--color-safe)',
                                        }} />
                                    </div>
                                    <div className={styles.bpmScale}><span>50</span><span>Normal (60–100)</span><span>180</span></div>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.disabledState}>
                                <Heart size={32} className={styles.disabledIcon} />
                                {!btSupported
                                    ? <span>Web Bluetooth not available — use Chrome on Android or desktop</span>
                                    : btHRState.error
                                        ? <span style={{ color: 'var(--color-danger)' }}>{btHRState.error}</span>
                                        : <span>Pair a BLE heart rate monitor (Polar, Garmin, Mi Band, etc.)</span>}
                            </div>
                        )}
                    </section>

                    {/* Emergency Contacts */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Phone size={18} className={styles.cardIcon} />
                                <h2 className={styles.cardTitle}>Emergency Contacts</h2>
                            </div>
                        </div>
                        <div className={styles.contactsList}>
                            {state.emergencyContacts.map((c) => (
                                <div key={c.id} className={styles.contactItem}>
                                    <div className={styles.contactAvatar}>{c.name.charAt(0)}</div>
                                    <div className={styles.contactInfo}>
                                        <span className={styles.contactName}>{c.name}
                                            {c.isPrimary && <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: '10px' }}>Primary</span>}
                                        </span>
                                        <span className={styles.contactRel}>{c.relationship} · {c.phone}</span>
                                    </div>
                                    <a href={`tel:${c.phone}`} className={`btn btn-outline ${styles.callContactBtn}`} aria-label={`Call ${c.name}`}>
                                        <Phone size={14} />
                                    </a>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Fake Call */}
                    <section className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Phone size={18} className={styles.cardIcon} />
                                <div>
                                    <h2 className={styles.cardTitle}>Fake Call</h2>
                                    <p className={styles.cardSub}>Appear occupied without calling anyone</p>
                                </div>
                            </div>
                        </div>

                        {fakeCallState === 'idle' && (
                            <div className={styles.fakeCallIdle}>
                                <button
                                    className="btn btn-safe"
                                    onClick={triggerFakeCall}
                                    id="fake-call-btn"
                                >
                                    <PlayCircle size={18} />
                                    Trigger Fake Call
                                </button>
                                <p className={styles.fakeCallHint}>
                                    A realistic incoming call UI will appear. Appears on-screen only — no actual call made.
                                </p>
                            </div>
                        )}

                        {fakeCallState === 'ringing' && (
                            <div className={styles.fakeCallRinging}>
                                <div className={styles.fakeCallPhone}>
                                    <div className={styles.fakeCallRingAnim} />
                                    <div className={styles.fakeCallRingAnim} style={{ animationDelay: '0.5s' }} />
                                    <div className={styles.phoneIcon}>📱</div>
                                </div>
                                <p className={styles.fakeCallerName}>{fakeCallerName}</p>
                                <p className={styles.fakeCallStatus}>Incoming call...</p>
                                <div className={styles.fakeCallActions}>
                                    <button className="btn btn-safe" onClick={() => setFakeCallState('active')}>
                                        ✅ Answer
                                    </button>
                                    <button className="btn btn-danger" onClick={endFakeCall}>
                                        ❌ Decline
                                    </button>
                                </div>
                            </div>
                        )}

                        {fakeCallState === 'active' && (
                            <div className={styles.fakeCallActive}>
                                <div className={styles.fakeCallOngoingHeader}>
                                    <div className={styles.fakeCallAvatar}>{fakeCallerName.charAt(0)}</div>
                                    <div>
                                        <p className={styles.fakeCallerName}>{fakeCallerName}</p>
                                        <p className={styles.fakeCallTimer}>
                                            <Clock size={12} />
                                            {formatDuration(fakeCallDuration)}
                                        </p>
                                    </div>
                                </div>
                                <div className={styles.fakeCallScript}>
                                    <p>"Enna, paravaillai – naan ippave varantirukken. 5 nimisam thaan."</p>
                                    <p className={styles.fakeCallScriptEn}>("Don't worry, I'm on my way. Just 5 minutes.")</p>
                                </div>
                                <button className="btn btn-danger" onClick={endFakeCall}>
                                    <StopCircle size={16} />
                                    End Call
                                </button>
                            </div>
                        )}
                    </section>

                    {/* Alert History */}
                    <section className={`glass-card ${styles.card} ${styles.historyCard}`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderLeft}>
                                <Clock size={18} className={styles.cardIcon} />
                                <h2 className={styles.cardTitle}>Alert History</h2>
                            </div>
                        </div>
                        <div className={styles.historyList}>
                            {state.alertHistory.slice(0, 5).map((alert) => (
                                <div key={alert.id} className={styles.historyItem}>
                                    <div className={[styles.historyDot,
                                    alert.status === 'resolved' ? styles.historyDotResolved : '',
                                    alert.type === 'test' ? styles.historyDotTest : '',
                                    alert.cancelled ? styles.historyDotCancelled : '',
                                    ].join(' ')} />
                                    <div className={styles.historyInfo}>
                                        <span className={styles.historyType}>
                                            {alert.type === 'test' ? 'Test SOS' : `SOS — ${alert.trigger}`}
                                        </span>
                                        <span className={styles.historyLocation}>{alert.location}</span>
                                    </div>
                                    <div className={styles.historyMeta}>
                                        <span className={styles.historyTime}>
                                            {new Date(alert.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </span>
                                        <span className={`badge ${alert.cancelled ? 'badge-muted' :
                                            alert.status === 'resolved' ? 'badge-safe' :
                                                alert.type === 'test' ? 'badge-warning' :
                                                    'badge-danger'
                                            }`}>
                                            {alert.cancelled ? 'Cancelled' : alert.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

