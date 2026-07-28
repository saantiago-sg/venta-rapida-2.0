import { Injectable, inject, signal } from '@angular/core';

import {
  AdminBusiness,
  BusinessAdminRepository,
  CreateBusinessInput,
  PlatformMetrics,
  SubscriptionStatus
} from '../data-access/business-admin.repository';

@Injectable({ providedIn: 'root' })
export class SuperAdminStore {
  private readonly repository = inject(BusinessAdminRepository);

  private readonly _businesses = signal<AdminBusiness[]>([]);
  private readonly _loading = signal(false);
  private readonly _metrics = signal<PlatformMetrics | null>(null);
  private readonly _metricsLoading = signal(false);

  readonly businesses = this._businesses.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly metrics = this._metrics.asReadonly();
  readonly metricsLoading = this._metricsLoading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      this._businesses.set(await this.repository.list());
    } finally {
      this._loading.set(false);
    }
  }

  async loadMetrics(): Promise<void> {
    this._metricsLoading.set(true);
    try {
      this._metrics.set(await this.repository.getMetrics());
    } finally {
      this._metricsLoading.set(false);
    }
  }

  async createBusiness(input: CreateBusinessInput): Promise<void> {
    await this.repository.create(input);
    await this.load();
  }

  async setActive(businessId: string, active: boolean): Promise<void> {
    await this.repository.setActive(businessId, active);
    this._businesses.update((list) => list.map((b) => (b.id === businessId ? { ...b, active } : b)));
  }

  async setSubscriptionStatus(businessId: string, status: SubscriptionStatus): Promise<void> {
    await this.repository.setSubscriptionStatus(businessId, status);
    this._businesses.update((list) =>
      list.map((b) => (b.id === businessId ? { ...b, subscriptionStatus: status } : b))
    );
  }
}
