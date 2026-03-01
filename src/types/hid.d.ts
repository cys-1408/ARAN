interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
}

interface HIDConnectionEvent extends Event {
    readonly device: HIDDevice;
}

interface HIDInputReportEvent extends Event {
    readonly data: DataView;
    readonly device: HIDDevice;
    readonly reportId: number;
}

interface HIDDevice extends EventTarget {
    readonly opened: boolean;
    readonly vendorId: number;
    readonly productId: number;
    readonly productName: string;
    readonly serialNumber?: string;
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
    removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void;
}

interface HID extends EventTarget {
    getDevices(): Promise<HIDDevice[]>;
    requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
    addEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void;
}

interface Navigator {
    readonly hid: HID;
}
