/**
 * Bluetooth Heart Rate Monitor — Real Web Bluetooth GATT
 *
 * Connects to any BLE heart rate monitor (Polar, Garmin, Fitbit Charge,
 * Mi Band, etc.) via the W3C Web Bluetooth API.
 *
 * GATT Services used:
 *   - Heart Rate Service:            UUID 0x180D
 *   - Heart Rate Measurement Char:   UUID 0x2A37
 *   - Battery Service (optional):    UUID 0x180F
 *   - Device Name:                   UUID 0x2A00
 *
 * BLE Heart Rate Measurement value format (as per Bluetooth SIG spec):
 *   Byte 0: Flags
 *     Bit 0: 0 = HR value is UINT8, 1 = HR value is UINT16
 *     Bit 1-2: Sensor contact
 *     Bit 3: Energy Expended present
 *     Bit 4: RR-Interval present
 *   Byte 1 (or 1-2): Heart rate value
 */

export type BtHRStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface BtHRState {
    status: BtHRStatus;
    deviceName: string | null;
    heartRateBpm: number | null;
    batteryLevel: number | null;
    sensorContact: boolean;
    rrIntervals: number[];  // milliseconds between beats
    error: string | null;
}

type BtHRCallback = (state: BtHRState) => void;

class BluetoothHeartRateMonitor {
    private device: BluetoothDevice | null = null;
    private server: BluetoothRemoteGATTServer | null = null;
    private hrCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private callbacks: Set<BtHRCallback> = new Set();

    private state: BtHRState = {
        status: 'disconnected',
        deviceName: null,
        heartRateBpm: null,
        batteryLevel: null,
        sensorContact: false,
        rrIntervals: [],
        error: null,
    };

    static isSupported(): boolean {
        // Bluetooth API available in Chrome 56+ (desktop/Android)
        return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    }

    isSupported(): boolean {
        return BluetoothHeartRateMonitor.isSupported();
    }

    subscribe(cb: BtHRCallback) {
        this.callbacks.add(cb);
        cb({ ...this.state });
        return () => this.callbacks.delete(cb);
    }

    private emit(patch: Partial<BtHRState>) {
        this.state = { ...this.state, ...patch };
        this.callbacks.forEach(cb => cb({ ...this.state }));
    }

    async requestAndConnect(): Promise<void> {
        if (!BluetoothHeartRateMonitor.isSupported()) {
            this.emit({ status: 'error', error: 'Web Bluetooth not supported in this browser.' });
            return;
        }

        try {
            this.emit({ status: 'connecting', error: null });

            // Request user to pick a BLE device that advertises Heart Rate service
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: ['heart_rate'] },
                ],
                optionalServices: ['battery_service', 'device_information'],
            });

            // Handle unexpected disconnection
            this.device.addEventListener('gattserverdisconnected', () => {
                this.emit({ status: 'disconnected', heartRateBpm: null, sensorContact: false });
                this.attemptReconnect();
            });

            await this.connectGATT();
        } catch (err) {
            const msg = (err as Error).message;
            // User cancelled device picker — not an error
            if (msg.includes('cancelled') || msg.includes('chooser')) {
                this.emit({ status: 'disconnected' });
            } else {
                this.emit({ status: 'error', error: msg });
            }
        }
    }

    private async connectGATT(): Promise<void> {
        if (!this.device?.gatt) return;

        this.server = await this.device.gatt.connect();
        this.emit({ deviceName: this.device.name ?? 'Unknown Device' });

        // --- Heart Rate Service ---
        const hrService = await this.server.getPrimaryService('heart_rate');
        this.hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');

        await this.hrCharacteristic.startNotifications();
        this.hrCharacteristic.addEventListener('characteristicvaluechanged',
            this.handleHRMeasurement.bind(this)
        );

        // --- Battery Service (optional) ---
        try {
            const batService = await this.server.getPrimaryService('battery_service');
            const batChar = await batService.getCharacteristic('battery_level');
            const batValue = await batChar.readValue();
            this.emit({ batteryLevel: batValue.getUint8(0) });

            batChar.addEventListener('characteristicvaluechanged', (event) => {
                const target = event.target as BluetoothRemoteGATTCharacteristic;
                this.emit({ batteryLevel: target.value!.getUint8(0) });
            });
            await batChar.startNotifications();
        } catch {
            // Battery service not available — non-fatal
        }

        this.emit({ status: 'connected', error: null });
    }

    /**
     * Parse the Heart Rate Measurement characteristic value
     * per Bluetooth SIG specification GATT:0x2A37
     */
    private handleHRMeasurement(event: Event) {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const value = target.value!;

        const flags = value.getUint8(0);
        const isUint16 = (flags & 0x01) !== 0;
        const sensorContact = (flags & 0x06) === 0x06;  // Bits 1-2 both set = contact detected
        const energyExpendedPresent = (flags & 0x08) !== 0;
        const rrIntervalsPresent = (flags & 0x10) !== 0;

        let byteOffset = 1;

        // Heart rate value
        const bpm = isUint16
            ? value.getUint16(byteOffset, /*littleEndian=*/true)
            : value.getUint8(byteOffset);
        byteOffset += isUint16 ? 2 : 1;

        // Energy expended (kJ) — skip if present
        if (energyExpendedPresent) byteOffset += 2;

        // RR-Intervals (1/1024 second units → convert to ms)
        const rrIntervals: number[] = [];
        if (rrIntervalsPresent) {
            while (byteOffset + 1 < value.byteLength) {
                const rrRaw = value.getUint16(byteOffset, true);
                rrIntervals.push(Math.round((rrRaw / 1024) * 1000));  // convert to ms
                byteOffset += 2;
            }
        }

        this.emit({
            heartRateBpm: bpm,
            sensorContact,
            rrIntervals: rrIntervals.length > 0 ? rrIntervals : this.state.rrIntervals,
        });
    }

    private async attemptReconnect(retries = 3, delayMs = 2000) {
        for (let i = 0; i < retries; i++) {
            await new Promise(r => setTimeout(r, delayMs));
            try {
                if (this.device?.gatt) {
                    await this.connectGATT();
                    return;
                }
            } catch { /* retry */ }
        }
        this.emit({ status: 'error', error: 'Reconnection failed after 3 attempts.' });
    }

    async disconnect() {
        await this.hrCharacteristic?.stopNotifications?.().catch(() => { });
        this.server?.disconnect();
        this.device = null;
        this.server = null;
        this.hrCharacteristic = null;
        this.emit({
            status: 'disconnected',
            deviceName: null,
            heartRateBpm: null,
            sensorContact: false,
            batteryLevel: null,
            rrIntervals: [],
        });
    }

    getState() { return { ...this.state }; }
}

export const bluetoothHRM = new BluetoothHeartRateMonitor();
