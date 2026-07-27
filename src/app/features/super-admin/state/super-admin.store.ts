import { Injectable, inject, signal } from '@angular/core';

import { AdminBusiness, BusinessAdminRepository, CreateBusinessInput } from '../data-access/business-admin.repository';

@Injectable({ providedIn: 'root' })
export class SuperAdminStore {
  private readonly repository = inject(BusinessAdminRepository);

  private readonly _businesses = signal<AdminBusiness[]>([]);
  private readonly _loading = signal(false);

  readonly businesses = this._businesses.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      this._businesses.set(await this.repository.list());
    } finally {
      this._loading.set(false);
    }
  }

  async createBusiness(input: CreateBusinessInput): Promise<void> {
    await this.repository.create(input);
    await this.load();
  }
}
