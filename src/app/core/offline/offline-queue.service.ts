import { Injectable, signal } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';

import { ProcessSaleInput } from '../../features/pos/data-access/models';

// El ticket ya se imprime al momento de la venta (PosStore.confirmSale devuelve un SaleResult
// con pending:true, y el flujo de impresion de siempre lo toma igual) -- lo unico que hace
// falta guardar aca es lo necesario para poder reintentar process_sale mas tarde.
export interface PendingSale {
  clientReference: string;
  input: ProcessSaleInput;
  createdAt: string;
}

interface OfflineDb extends DBSchema {
  pending_sales: {
    key: string;
    value: PendingSale;
  };
}

const DB_NAME = 'venta-rapida-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_sales';

// Cola de ventas encoladas por falta de conexion (ver SyncService, que la drena). Vive en
// IndexedDB para sobrevivir un reload de la pestaña durante el corte -- una venta ya encolada
// nunca se pierde, aunque el cajero recargue antes de que vuelva la conexion.
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null;
  private readonly _pendingCount = signal(0);
  readonly pendingCount = this._pendingCount.asReadonly();

  constructor() {
    void this.refreshCount();
  }

  async enqueue(sale: PendingSale): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAME, sale);
    await this.refreshCount();
  }

  async getAll(): Promise<PendingSale[]> {
    const db = await this.getDb();
    return db.getAll(STORE_NAME);
  }

  async remove(clientReference: string): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAME, clientReference);
    await this.refreshCount();
  }

  private getDb(): Promise<IDBPDatabase<OfflineDb>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<OfflineDb>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore(STORE_NAME, { keyPath: 'clientReference' });
        }
      });
    }
    return this.dbPromise;
  }

  private async refreshCount(): Promise<void> {
    try {
      const db = await this.getDb();
      this._pendingCount.set(await db.count(STORE_NAME));
    } catch {
      // IndexedDB puede fallar (modo privado estricto, cuota, etc.) -- que no rompa el resto
      // de la app; el contador queda en 0 y la venta online normal sigue andando igual.
      this._pendingCount.set(0);
    }
  }
}
