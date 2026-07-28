import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { DeliveryTypeRepository } from '../data-access/delivery-type.repository';
import { DeliveryType } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class DeliveryTypesStore {
  private readonly repository = inject(DeliveryTypeRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _deliveryTypes = signal<DeliveryType[]>([]);
  private readonly _loading = signal(false);

  readonly deliveryTypes = this._deliveryTypes.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._deliveryTypes.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
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
