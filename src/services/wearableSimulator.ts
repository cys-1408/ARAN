/**
 * Wearable Simulator — WebHID API Heart-Rate Simulation
 * Simulates a BLE heart-rate monitor feeding data to the SOS confidence system.
 * In a production build this would connect to a real HID device or BLE GATT service.
 */

type HeartRateCallback = (bpm: number, status: 'connected' | 'disconnected' | 'elevated') => void;

class WearableSimulator {
    private isRunning = false;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private callbacks: Set<HeartRateCallback> = new Set();
    private currentBpm = 72;
    private baselineBpm = 72;
    private simulatedStressLevel = 0; // 0–1

    subscribe(cb: HeartRateCallback) {
        this.callbacks.add(cb);
        return () => this.callbacks.delete(cb);
    }

    private emit(bpm: number, status: 'connected' | 'disconnected' | 'elevated') {
        this.callbacks.forEach(cb => cb(bpm, status));
    }

    async connect(): Promise<void> {
        // Try real WebHID if available (future-proofing)
        if ('hid' in navigator) {
            // In production: const devices = await (navigator as never as { hid: HID }).hid.requestDevice(...)
            // For now: fall through to simulation
        }
        this.isRunning = true;
        this.simulateHeartRate();
        this.emit(this.currentBpm, 'connected');
    }

    disconnect() {
        this.isRunning = false;
        if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
        this.emit(0, 'disconnected');
    }

    /** Inject stress event — used by SOS orchestrator to simulate elevated HR */
    injectStressEvent(level: number) {
        this.simulatedStressLevel = Math.max(0, Math.min(1, level));
    }

    private simulateHeartRate() {
        this.intervalId = setInterval(() => {
            if (!this.isRunning) return;

            // Gradually drift BPM based on stress level + natural variability
            const stressTarget = this.baselineBpm + this.simulatedStressLevel * 60; // up to +60 BPM
            const noise = (Math.random() - 0.5) * 4;
            const drift = (stressTarget - this.currentBpm) * 0.1;
            this.currentBpm = Math.round(Math.max(50, Math.min(180, this.currentBpm + drift + noise)));

            // Naturally decay stress
            this.simulatedStressLevel = Math.max(0, this.simulatedStressLevel - 0.02);

            const status = this.currentBpm > 115 ? 'elevated' : 'connected';
            this.emit(this.currentBpm, status);
        }, 1000);
    }

    getBpm() { return this.currentBpm; }
    isConnected() { return this.isRunning; }
}

export const wearableSimulator = new WearableSimulator();
