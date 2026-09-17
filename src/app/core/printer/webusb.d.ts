// Tipos minimos de WebUSB (Chrome/Edge) -- no esta en lib.dom.d.ts y no vale la pena sumar una
// dependencia solo para esto. Cubre unicamente lo que usa PrinterService.
interface USBDevice {
  readonly productName?: string;
  readonly vendorId: number;
  readonly productId: number;
}

interface USBDeviceRequestOptions {
  filters: { vendorId?: number; productId?: number }[];
}

interface USBConnectionEvent extends Event {
  readonly device: USBDevice;
}

interface USB extends EventTarget {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
  addEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void): void;
}

interface Navigator {
  readonly usb?: USB;
}
