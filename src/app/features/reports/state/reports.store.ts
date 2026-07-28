import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsRepository } from '../data-access/reports.repository';
import { ReportRangePreset, SalesSummary, TopProduct } from '../data-access/models';

function rangeForPreset(preset: ReportRangePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  if (preset === 'last7days') {
    from.setDate(from.getDate() - 6);
  } else if (preset === 'thisMonth') {
    from.setDate(1);
  }

  return { from, to };
}

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly repository = inject(ReportsRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _preset = signal<ReportRangePreset>('today');
  private readonly _summary = signal<SalesSummary | null>(null);
  private readonly _topProducts = signal<TopProduct[]>([]);
  private readonly _loading = signal(false);

  readonly preset = this._preset.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly topProducts = this._topProducts.asReadonly();
  readonly loading = this._loading.asReadonly();

  async setPreset(preset: ReportRangePreset): Promise<void> {
    this._preset.set(preset);
    await this.load();
  }

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const { from, to } = rangeForPreset(this._preset());

    this._loading.set(true);
    try {
      const [summary, topProducts] = await Promise.all([
        this.repository.getSummary(businessId, from, to),
        this.repository.getTopProducts(businessId, from, to)
      ]);
      this._summary.set(summary);
      this._topProducts.set(topProducts);
    } finally {
      this._loading.set(false);
    }
  }
}
