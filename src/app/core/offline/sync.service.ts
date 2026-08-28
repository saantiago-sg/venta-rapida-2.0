import { Injectable, effect, inject } from '@angular/core';

import { SaleRepository } from '../../features/pos/data-access/sale.repository';
import { ConnectivityService } from './connectivity.service';
import { OfflineQueueService } from './offline-queue.service';

// Ademas del evento 'online', un respaldo cada tanto por si navigator.onLine da falso
// positivo (wifi "conectado" pero sin salida real a internet).
const RETRY_INTERVAL_MS = 30000;

// Drena la cola de ventas pendientes apenas hay conexion. Se instancia una sola vez a nivel
// raiz (ver app.config.ts) para que siga sincronizando aunque el cajero no este parado en la
// pantalla de Vender.
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly saleRepository = inject(SaleRepository);
  private readonly connectivity = inject(ConnectivityService);
  private readonly queue = inject(OfflineQueueService);

  private draining = false;

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

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const pending = await this.queue.getAll();
      for (const sale of pending) {
        try {
          await this.saleRepository.processSale(sale.input);
          await this.queue.remove(sale.clientReference);
        } catch {
          // Sigue sin conexion (u otro problema transitorio) -- se deja en la cola y se
          // reintenta en la proxima pasada. Se corta esta pasada para no martillar el server
          // reintentando todo el resto en cadena si la primera ya fallo por lo mismo.
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
