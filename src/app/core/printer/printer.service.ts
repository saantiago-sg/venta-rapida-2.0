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

  // Tocar navigator.usb (aunque sea solo getDevices(), sin pedir permiso) deja la pagina
  // afuera del back/forward cache de Chrome mientras dure -- por eso NO se arranca a mirar el
  // puerto en el constructor (que corria en cada carga del Shell, o sea de toda la app). Se
  // arranca recien cuando el usuario interactua con el indicador de la impresora (hover/foco)
  // o intenta emparejar -- watchDevices() es idempotente, no pasa nada si se llama de mas.
  private watching = false;

  // Se llama desde el (mouseenter)/(focus) del boton de estado en el Shell, y tambien antes de
  // pair() -- asi el primer click ya tiene el estado real, no el valor inicial en false.
  watchDevices(): void {
    if (this.watching || !navigator.usb) return;
    this.watching = true;

    void this.refresh();
    navigator.usb.addEventListener('connect', () => this.refresh());
    navigator.usb.addEventListener('disconnect', () => this.refresh());
  }

  // Le pide al usuario que autorice el dispositivo (requiere gesto del usuario, ej. click).
  // El navegador recuerda la autorizacion entre sesiones, asi que esto solo hace falta la
  // primera vez o si el usuario revoca el permiso desde la configuracion del navegador.
  async pair(): Promise<void> {
    if (!navigator.usb) return;
    this.watchDevices();

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
