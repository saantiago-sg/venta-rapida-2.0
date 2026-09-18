import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { readCache, writeCache } from '../../../core/offline/local-cache';
import { DeliveryTypeRepository } from '../data-access/delivery-type.repository';
import { DeliveryType } from '../data-access/models';

const CACHE_KEY = (businessId: string) => `delivery_types_cache_${businessId}`;

@Injectable({ providedIn: 'root' })
export class DeliveryTypesStore {
  private readonly repository = inject(DeliveryTypeRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _deliveryTypes = signal<DeliveryType[]>([]);
  private readonly _loading = signal(false);

  readonly deliveryTypes = this._deliveryTypes.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache por negocio activo (ver ProductsStore.load()) -- solo se marca "cargado" cuando la
  // red responde bien, mismo criterio que PaymentMethodsStore.
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
        const types = await this.repository.list(businessId);
        this._deliveryTypes.set(types);
        writeCache(CACHE_KEY(businessId), types);
        this.loadedForBusinessId = businessId;
      } catch (err) {
        // Sin conexion: se sigue con la ultima lista conocida en vez de dejar al cajero sin
        // poder elegir tipo de entrega y trabado para cobrar (ver PosStore -- venta offline).
        const cached = readCache<DeliveryType[]>(CACHE_KEY(businessId));
        if (!cached) throw err;
        this._deliveryTypes.set(cached);
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async create(name: string): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const type = await this.repository.create(businessId, name);
    this._deliveryTypes.update((list) => [...list, type].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._deliveryTypes.update((list) => list.map((d) => (d.id === id ? { ...d, active } : d)));
  }
}
