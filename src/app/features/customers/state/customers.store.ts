import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { CustomerRepository } from '../data-access/customer.repository';
import { Customer, CustomerFormValue } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class CustomersStore {
  private readonly repository = inject(CustomerRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _customers = signal<Customer[]>([]);
  private readonly _loading = signal(false);

  readonly customers = this._customers.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache por negocio activo (ver ProductsStore.load()) -- evita re-pedir la lista completa
  // cada vez que se vuelve a esta pantalla navegando dentro de la SPA.
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
        this._customers.set(await this.repository.list(businessId));
        this.loadedForBusinessId = businessId;
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async create(input: CustomerFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const customer = await this.repository.create(businessId, input);
    this._customers.update((list) => [...list, customer].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async update(id: string, input: CustomerFormValue): Promise<void> {
    await this.repository.update(id, input);
    this._customers.update((list) => list.map((c) => (c.id === id ? { ...c, ...input } : c)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._customers.update((list) => list.map((c) => (c.id === id ? { ...c, active } : c)));
  }
}
