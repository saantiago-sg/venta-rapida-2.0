import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { PaymentMethodRepository } from '../data-access/payment-method.repository';
import { PaymentMethod } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class PaymentMethodsStore {
  private readonly repository = inject(PaymentMethodRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _paymentMethods = signal<PaymentMethod[]>([]);
  private readonly _loading = signal(false);

  readonly paymentMethods = this._paymentMethods.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._paymentMethods.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
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

  async setInvoicingEnabled(id: string, invoicingEnabled: boolean): Promise<void> {
    await this.repository.setInvoicingEnabled(id, invoicingEnabled);
    this._paymentMethods.update((list) =>
      list.map((m) => (m.id === id ? { ...m, invoicingEnabled } : m))
    );
  }
}
