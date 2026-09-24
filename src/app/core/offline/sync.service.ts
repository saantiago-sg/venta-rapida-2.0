import { Injectable, effect, inject, signal } from '@angular/core';

import { SaleRepository } from '../../features/pos/data-access/sale.repository';
import { ConnectivityService } from './connectivity.service';
import { isNetworkError } from './network-error';
import { OfflineQueueService } from './offline-queue.service';

// Ademas del evento 'online', un respaldo cada tanto por si navigator.onLine da falso
// positivo (wifi "conectado" pero sin salida real a internet).
const RETRY_INTERVAL_MS = 30000;

// El PostgrestError de Supabase (lo que tira SaleRepository.processSale) es un objeto plano con
// .message, no una instancia de Error -- sin esto el aviso perdia el motivo real del rechazo
// (caja cerrada, precio cambiado, sesion vencida, etc.) y solo mostraba el texto generico.
function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : 'No se pudo sincronizar una venta pendiente.';
}

export interface SyncFailure {
  clientReference: string;
  message: string;
}

// Drena la cola de ventas pendientes apenas hay conexion. Se instancia una sola vez a nivel
// raiz (ver app.config.ts) para que siga sincronizando aunque el cajero no este parado en la
// pantalla de Vender.
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly saleRepository = inject(SaleRepository);
  private readonly connectivity = inject(ConnectivityService);
  private readonly queue = inject(OfflineQueueService);

  private draining = false;

  private readonly _failures = signal<SyncFailure[]>([]);
  // Ventas que el servidor rechazo de verdad (no por falta de conexion) al sincronizar --
  // ej. el precio congelado quedo fuera de tolerancia. Se sacan de la cola porque reintentar
  // la misma venta con el mismo dato invalido fallaria para siempre; el cajero tiene que
  // rehacerlas a mano con los datos actuales (ver Shell, que muestra este aviso).
  readonly failures = this._failures.asReadonly();

  // effect() necesita construirse en contexto de inyeccion -- por eso arranca aca (constructor)
  // y no en un metodo aparte. Alcanza con inyectar el servicio una vez al bootstrapear (ver
  // app.config.ts) para que quede corriendo en segundo plano durante toda la sesion.
  constructor() {
    effect(() => {
      if (this.connectivity.isOnline()) void this.drain();
    });
    setInterval(() => void this.drain(), RETRY_INTERVAL_MS);
    void this.drain();
  }

  dismissFailure(clientReference: string): void {
    this._failures.update((failures) => failures.filter((f) => f.clientReference !== clientReference));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const pending = await this.queue.getAll();
      for (const sale of pending) {
        try {
          await this.saleRepository.processSale(sale.input);
          await this.queue.remove(sale.clientReference);
        } catch (err) {
          if (isNetworkError(err)) {
            // Sigue sin conexion (u otro problema transitorio) -- se deja en la cola y se
            // reintenta en la proxima pasada. Se corta esta pasada para no martillar el server
            // reintentando todo el resto en cadena si la primera ya fallo por lo mismo.
            break;
          }
          // Hubo conexion y el servidor la rechazo de verdad (ej. precio fuera de tolerancia):
          // no tiene sentido reintentar la misma venta para siempre. Se saca de la cola y se
          // avisa, pero se sigue con el resto de la cola (este fallo es puntual de esta venta).
          await this.queue.remove(sale.clientReference);
          this._failures.update((failures) => [
            ...failures,
            {
              clientReference: sale.clientReference,
              message: errorMessage(err)
            }
          ]);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
