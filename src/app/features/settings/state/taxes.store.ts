import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { TaxRepository } from '../data-access/tax.repository';
import { Tax } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class TaxesStore {
  private readonly repository = inject(TaxRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _taxes = signal<Tax[]>([]);
  private readonly _loading = signal(false);

  readonly taxes = this._taxes.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly activeTaxes = computed(() => this._taxes().filter((t) => t.active));

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._taxes.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async create(name: string, rate: number): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const tax = await this.repository.create(businessId, name, rate);
    this._taxes.update((list) => [...list, tax].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._taxes.update((list) => list.map((t) => (t.id === id ? { ...t, active } : t)));
  }
}
