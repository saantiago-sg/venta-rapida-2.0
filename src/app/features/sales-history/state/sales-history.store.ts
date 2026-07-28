import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { SalesHistoryRepository } from '../data-access/sales-history.repository';
import { SaleItem, SaleListItem } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class SalesHistoryStore {
  private readonly repository = inject(SalesHistoryRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _sales = signal<SaleListItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _selectedItems = signal<SaleItem[]>([]);
  private readonly _itemsLoading = signal(false);

  readonly sales = this._sales.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selectedItems = this._selectedItems.asReadonly();
  readonly itemsLoading = this._itemsLoading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._sales.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async loadItems(saleId: string): Promise<void> {
    this._itemsLoading.set(true);
    try {
      this._selectedItems.set(await this.repository.getItems(saleId));
    } finally {
      this._itemsLoading.set(false);
    }
  }

  async cancel(saleId: string, reason: string | null): Promise<void> {
    await this.repository.cancel(saleId, reason);
    await this.load();
  }
}
