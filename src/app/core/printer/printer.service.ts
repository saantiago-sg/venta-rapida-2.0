import { Injectable, signal } from '@angular/core';

// Estado de conexion de la impresora termica via WebUSB. Solo detecta presencia del
// dispositivo (no imprime nada todavia -- el ticket sigue saliendo por window.print(), ver
// ticket-print.ts). Ojo: si Windows ya tiene instalado el driver de impresora estandar para el
// dispositivo, WebUSB puede no listarlo aunque este conectado y funcionando -- es una
// limitacion conocida de impresoras termicas genericas, no un bug de este servicio.
@Injectable({ providedIn: 'root' })
export class PrinterService {
  // Chrome/Edge only -- Safari y Firefox no implementan WebUSB.
  readonly supported = !!navigator.usb;

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  constructor() {
    if (!navigator.usb) return;

    void this.refresh();
    navigator.usb.addEventListener('connect', () => this.refresh());
    navigator.usb.addEventListener('disconnect', () => this.refresh());
  }

  // Le pide al usuario que autorice el dispositivo (requiere gesto del usuario, ej. click).
  // El navegador recuerda la autorizacion entre sesiones, asi que esto solo hace falta la
  // primera vez o si el usuario revoca el permiso desde la configuracion del navegador.
  async pair(): Promise<void> {
    if (!navigator.usb) return;

    try {
      await navigator.usb.requestDevice({ filters: [] });
      await this.refresh();
    } catch {
      // El usuario cerro el selector sin elegir nada -- no es un error real.
    }
  }

  private async refresh(): Promise<void> {
    const devices = await navigator.usb!.getDevices();
    this._connected.set(devices.length > 0);
  }
}
