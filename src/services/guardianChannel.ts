/// <reference types="vite/client" />
/**
 * Guardian WebRTC Channel — Real Peer-to-Peer Guardian Communication
 *
 * Implements a real WebRTC DataChannel connection so a guardian can track
 * the user's live location during an emergency journey.
 *
 * Architecture:
 *   USER DEVICE        SIGNALING (BroadcastChannel / LocalStorage)      GUARDIAN DEVICE
 *   ─────────          ─────────────────────────────────────────          ─────────────
 *   Offer SDP  ──────────────────────────────────────────────────────►   setRemoteDesc
 *              ◄─────────────────────────────────────────────────────   Answer SDP
 *   ICE cands  ──────────────────────────────────────────────────────►
 *              ◄──────────────────────────────────────────────────── ICE cands
 *                         RTCDataChannel ESTABLISHED
 *   location ping ──────────────────────────────────────────────────► received on guardian
 *
 * Signaling options (in priority order):
 *   1. BroadcastChannel (same device / same browser — dev mode)
 *   2. LocalStorage events (same device, different tabs)
 *   3. VITE_SIGNALING_ENDPOINT (your own WebSocket server)
 *
 * ICE servers: Google public STUN (free, high availability)
 * TURN server: configurable via VITE_TURN_URLS if behind symmetric NAT
 */

export type GuardianRole = 'sender' | 'receiver';
export type GuardianStatus =
    | 'idle'
    | 'signaling'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'error';

export interface GuardianState {
    status: GuardianStatus;
    role: GuardianRole | null;
    peerName: string | null;
    latencyMs: number | null;
    error: string | null;
}

export interface LocationPing {
    type: 'location';
    lat: number;
    lng: number;
    accuracy: number;
    altitude: number | null;
    speed: number | null;
    timestamp: string;
    commitmentHex?: string;
}

export type GuardianMessage =
    | LocationPing
    | { type: 'ping'; ts: number }
    | { type: 'pong'; ts: number }
    | { type: 'sos-active' }
    | { type: 'safe'; message?: string };

type GuardianCallback = (state: GuardianState) => void;
type MessageCallback = (msg: GuardianMessage) => void;

// ---------------------------------------------------------------------------
// ICE / TURN configuration
// ---------------------------------------------------------------------------

function buildICEConfig(): RTCConfiguration {
    const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ];

    // Optional TURN server — configure via environment
    const turnUrls = import.meta.env.VITE_TURN_URLS;
    const turnUser = import.meta.env.VITE_TURN_USERNAME;
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;

    if (turnUrls && turnUser && turnCred) {
        iceServers.push({
            urls: turnUrls.split(',').map((u: string) => u.trim()),
            username: turnUser,
            credential: turnCred,
        });
    }

    return {
        iceServers,
        iceTransportPolicy: turnUrls ? 'relay' : 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
    };
}

// ---------------------------------------------------------------------------
// Signaling via BroadcastChannel (same-browser demo + same-network fallback)
// ---------------------------------------------------------------------------

const CHANNEL_NAME = 'aran-guardian-signal';

interface SignalMessage {
    from: string;     // session ID
    to?: string;      // target session ID (optional for broadcasts)
    type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
    payload: unknown;
}

class GuardianChannel {
    private pc: RTCPeerConnection | null = null;
    private dc: RTCDataChannel | null = null;
    private bc: BroadcastChannel | null = null;
    private wsSignal: WebSocket | null = null;
    private sessionId: string = crypto.randomUUID();
    private remoteSessionId: string | null = null;
    private pingIntervalId: ReturnType<typeof setInterval> | null = null;
    private pendingPingTs: number | null = null;

    private stateCallbacks: Set<GuardianCallback> = new Set();
    private messageCallbacks: Set<MessageCallback> = new Set();

    private state: GuardianState = {
        status: 'idle',
        role: null,
        peerName: null,
        latencyMs: null,
        error: null,
    };

    subscribeState(cb: GuardianCallback) {
        this.stateCallbacks.add(cb);
        cb({ ...this.state });
        return () => this.stateCallbacks.delete(cb);
    }

    subscribeMessages(cb: MessageCallback) {
        this.messageCallbacks.add(cb);
        return () => this.messageCallbacks.delete(cb);
    }

    private emitState(patch: Partial<GuardianState>) {
        this.state = { ...this.state, ...patch };
        this.stateCallbacks.forEach(cb => cb({ ...this.state }));
    }

    private emitMessage(msg: GuardianMessage) {
        this.messageCallbacks.forEach(cb => cb(msg));
    }

    // ── Signaling ──────────────────────────────────────────────────────────────

    private openSignaling() {
        const wsEndpoint = import.meta.env.VITE_SIGNALING_ENDPOINT;

        if (wsEndpoint) {
            // Real WebSocket signaling server
            this.wsSignal = new WebSocket(wsEndpoint);
            this.wsSignal.onmessage = (ev) => {
                try { this.handleSignalMessage(JSON.parse(ev.data)); } catch { /* ignore */ }
            };
            this.wsSignal.onerror = () => this.emitState({ error: 'WebSocket signaling error' });
        } else {
            // BroadcastChannel — works across tabs/windows in the same browser
            this.bc = new BroadcastChannel(CHANNEL_NAME);
            this.bc.onmessage = (ev) => {
                try { this.handleSignalMessage(ev.data); } catch { /* ignore */ }
            };
        }
    }

    private sendSignal(msg: Omit<SignalMessage, 'from'>) {
        const full: SignalMessage = { from: this.sessionId, ...msg };
        if (this.wsSignal?.readyState === WebSocket.OPEN) {
            this.wsSignal.send(JSON.stringify(full));
        } else {
            this.bc?.postMessage(full);
        }
    }

    private async handleSignalMessage(msg: SignalMessage) {
        // Ignore our own messages
        if (msg.from === this.sessionId) return;

        if (msg.type === 'join' && this.state.role === 'sender') {
            // A guardian announced themselves — initiate connection
            this.remoteSessionId = msg.from;
            await this.initiateOffer();
        }

        if (msg.to && msg.to !== this.sessionId) return; // Not for us

        if (msg.type === 'offer' && this.pc) {
            this.remoteSessionId = msg.from;
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.sendSignal({ to: msg.from, type: 'answer', payload: answer });
        }

        if (msg.type === 'answer' && this.pc) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
        }

        if (msg.type === 'ice-candidate' && this.pc) {
            const candidate = new RTCIceCandidate(msg.payload as RTCIceCandidateInit);
            await this.pc.addIceCandidate(candidate).catch(() => { });
        }
    }

    // ── RTCPeerConnection ──────────────────────────────────────────────────────

    private buildPeerConnection() {
        this.pc = new RTCPeerConnection(buildICEConfig());

        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate && this.remoteSessionId) {
                this.sendSignal({
                    to: this.remoteSessionId,
                    type: 'ice-candidate',
                    payload: candidate.toJSON(),
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            const cstate = this.pc?.connectionState;
            if (cstate === 'connected') this.emitState({ status: 'connected', error: null });
            if (cstate === 'disconnected' || cstate === 'failed') {
                this.emitState({ status: 'disconnected' });
                this.stopPingInterval();
            }
        };

        this.pc.ondatachannel = (ev) => {
            this.setupDataChannel(ev.channel);
        };
    }

    private setupDataChannel(channel: RTCDataChannel) {
        this.dc = channel;
        this.dc.binaryType = 'arraybuffer';

        this.dc.onopen = () => {
            this.emitState({ status: 'connected' });
            this.startPingInterval();
        };

        this.dc.onclose = () => {
            this.emitState({ status: 'disconnected' });
            this.stopPingInterval();
        };

        this.dc.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as GuardianMessage;
                // Handle latency measurement
                if (msg.type === 'pong' && this.pendingPingTs !== null) {
                    this.emitState({ latencyMs: Date.now() - this.pendingPingTs });
                    this.pendingPingTs = null;
                    return;
                }
                this.emitMessage(msg);
            } catch { /* ignore malformed */ }
        };

        this.dc.onerror = (ev) => {
            this.emitState({ error: `DataChannel error: ${(ev as RTCErrorEvent).error?.message ?? 'unknown'}` });
        };
    }

    private async initiateOffer() {
        if (!this.pc) return;
        this.dc = this.pc.createDataChannel('aran-guardian', {
            ordered: true,
            maxRetransmits: 3,
        });
        this.setupDataChannel(this.dc);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sendSignal({ to: this.remoteSessionId!, type: 'offer', payload: offer });
    }

    // ── Ping / latency measurement ─────────────────────────────────────────────

    private startPingInterval() {
        this.pingIntervalId = setInterval(() => {
            this.pendingPingTs = Date.now();
            this.send({ type: 'ping', ts: this.pendingPingTs });
        }, 5000);
    }

    private stopPingInterval() {
        if (this.pingIntervalId) { clearInterval(this.pingIntervalId); this.pingIntervalId = null; }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /** Start as the person being tracked (sender) */
    async startAsSender(displayName = 'ARAN User') {
        this.emitState({ status: 'signaling', role: 'sender', peerName: displayName });
        this.openSignaling();
        this.buildPeerConnection();
        // Announce presence so guardians can connect
        setTimeout(() => this.sendSignal({ type: 'join', payload: { name: displayName } }), 300);
    }

    /** Start as a guardian (receiver) — used by the guardian on their device */
    async startAsGuardian(displayName = 'Guardian') {
        this.emitState({ status: 'signaling', role: 'receiver', peerName: displayName });
        this.openSignaling();
        this.buildPeerConnection();
        this.sendSignal({ type: 'join', payload: { name: displayName } });
    }

    /** Send a message over the DataChannel */
    send(msg: GuardianMessage) {
        if (this.dc?.readyState === 'open') {
            this.dc.send(JSON.stringify(msg));
        }
    }

    /** Broadcast current GPS location to the guardian */
    sendLocation(coords: GeolocationCoordinates, commitmentHex?: string) {
        this.send({
            type: 'location',
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            altitude: coords.altitude,
            speed: coords.speed,
            timestamp: new Date().toISOString(),
            commitmentHex,
        });
    }

    /** Close everything */
    disconnect() {
        this.stopPingInterval();
        this.sendSignal({ type: 'leave', payload: {} });
        this.dc?.close();
        this.pc?.close();
        this.bc?.close();
        this.wsSignal?.close();
        this.dc = null; this.pc = null; this.bc = null; this.wsSignal = null;
        this.remoteSessionId = null;
        this.emitState({ status: 'idle', role: null, peerName: null, latencyMs: null });
    }

    getState() { return { ...this.state }; }
    getSessionId() { return this.sessionId; }
}

export const guardianChannel = new GuardianChannel();
