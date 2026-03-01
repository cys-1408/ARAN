/**
 * Web Bluetooth API Type Declarations
 * Covers Chrome's implementation of the W3C Web Bluetooth specification.
 * Required because TypeScript's default DOM lib may not include all BT types.
 */

interface BluetoothDevice extends EventTarget {
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
    readonly uuids?: string[];
    watchAdvertisements(): Promise<void>;
    addEventListener(type: 'gattserverdisconnected', listener: (this: BluetoothDevice, ev: Event) => void): void;
    addEventListener(type: 'advertisementreceived', listener: (this: BluetoothDevice, ev: Event) => void): void;
}

interface BluetoothRemoteGATTServer {
    readonly device: BluetoothDevice;
    readonly connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTService {
    readonly device: BluetoothDevice;
    readonly uuid: string;
    readonly isPrimary: boolean;
    getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    readonly service: BluetoothRemoteGATTService;
    readonly uuid: string;
    readonly properties: BluetoothCharacteristicProperties;
    readonly value: DataView | null;
    getDescriptor(descriptor: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor>;
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithResponse(value: BufferSource): Promise<void>;
    writeValueWithoutResponse(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: 'characteristicvaluechanged', listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event) => void): void;
}

interface BluetoothRemoteGATTDescriptor {
    readonly characteristic: BluetoothRemoteGATTCharacteristic;
    readonly uuid: string;
    readonly value?: DataView;
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothCharacteristicProperties {
    readonly authenticatedSignedWrites: boolean;
    readonly broadcast: boolean;
    readonly indicate: boolean;
    readonly notify: boolean;
    readonly read: boolean;
    readonly reliableWrite: boolean;
    readonly writableAuxiliaries: boolean;
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;
type BluetoothDescriptorUUID = number | string;

interface BluetoothRequestDeviceFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
    manufacturerData?: BluetoothManufacturerDataFilter[];
    serviceData?: BluetoothServiceDataFilter[];
}

interface BluetoothManufacturerDataFilter {
    companyIdentifier: number;
    dataPrefix?: BufferSource;
    mask?: BufferSource;
}

interface BluetoothServiceDataFilter {
    service: BluetoothServiceUUID;
    dataPrefix?: BufferSource;
    mask?: BufferSource;
}

interface RequestDeviceOptions {
    filters?: BluetoothRequestDeviceFilter[];
    exclusionFilters?: BluetoothRequestDeviceFilter[];
    optionalServices?: BluetoothServiceUUID[];
    optionalManufacturerData?: number[];
    acceptAllDevices?: boolean;
}

interface Bluetooth extends EventTarget {
    getAvailability(): Promise<boolean>;
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    getDevices(): Promise<BluetoothDevice[]>;
    addEventListener(type: 'availabilitychanged', listener: (this: Bluetooth, ev: Event) => void): void;
}

// Extend Navigator with Bluetooth
interface Navigator {
    readonly bluetooth: Bluetooth;
}
