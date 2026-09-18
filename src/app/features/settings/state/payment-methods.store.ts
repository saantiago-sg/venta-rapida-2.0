import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { readCache, writeCache } from '../../../core/offline/local-cache';
import { PaymentMethodRepository } from '../data-access/payment-method.repository';
import { PaymentMethod } from '../data-access/models';

const CACHE_KEY = (businessId: string) => `payment_methods_cache_${businessId}`;

@Injectable({ providedIn: 'root' })
export class PaymentMethodsStore {
  private readonly repository = inject(PaymentMethodRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _paymentMethods = signal<PaymentMethod[]>([]);
  private readonly _loading = signal(false);

  readonly paymentMethods = this._paymentMethods.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache por negocio activo (ver ProductsStore.load()) -- solo se marca "cargado" cuando la
  // red responde bien, para que si esta vez se cayo al cache offline, el proximo load() sin
  // forzar reintente contra el servidor en vez de quedarse pegado a ese fallback.
  private loadedForBusinessId: string | null = null;
  private loadPromise: Promise<void> | null = null;

  async load(force = false): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;
    if (!force && this.loadedForBusinessId === businessId) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      this._loading.set(true);
      try {
        const methods = await this.repository.list(businessId);
        this._paymentMethods.set(methods);
        writeCache(CACHE_KEY(businessId), methods);
        this.loadedForBusinessId = businessId;
      } catch (err) {
        // Sin conexion: se sigue con la ultima lista conocida en vez de dejar el diálogo de
        // cobro sin medios de pago para elegir (ver PosStore -- venta offline).
        const cached = readCache<PaymentMethod[]>(CACHE_KEY(businessId));
        if (!cached) throw err;
        this._paymentMethods.set(cached);
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async create(name: string, isCash: boolean): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const method = await this.repository.create(businessId, name, isCash);
    this._paymentMethods.update((list) => [...list, method].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._paymentMethods.update((list) => list.map((m) => (m.id === id ? { ...m, active } : m)));
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
    this._paymentMethods.update((list) => list.filter((m) => m.id !== id));
  }
}
