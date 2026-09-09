import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { StandaloneInvoiceRepository } from '../data-access/standalone-invoice.repository';
import { IssueInvoiceInput, IssueInvoiceResult, StandaloneInvoice } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class StandaloneInvoicesStore {
  private readonly repository = inject(StandaloneInvoiceRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _invoices = signal<StandaloneInvoice[]>([]);
  private readonly _loading = signal(false);

  readonly invoices = this._invoices.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._invoices.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  // Recarga la lista completa despues de emitir en vez de insertar en memoria a mano -- no hay
  // un `id`/`createdAt` reales hasta que el insert real vuelve, y son pocas filas, no vale la
  // pena la complejidad de una fila optimista provisoria.
  async issue(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) throw new Error('No hay un negocio activo.');

    const result = await this.repository.issue(businessId, input);
    await this.load();
    return result;
  }
}
