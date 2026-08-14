import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsRepository } from '../data-access/reports.repository';
import { ReportRangePreset, SalesSummary, TopProduct } from '../data-access/models';

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Limite superior exclusivo para la consulta: "Hasta hoy" tiene que incluir todo el dia de hoy.
function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function rangeForPreset(preset: ReportRangePreset): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const from = new Date(today);

  if (preset === 'last7days') {
    from.setDate(from.getDate() - 6);
  } else if (preset === 'thisMonth') {
    from.setDate(1);
  }

  return { from, to: today };
}

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly repository = inject(ReportsRepository);
  private readonly authStore = inject(AuthStore);

  // preset === null significa "rango manual" (el usuario tocó Desde/Hasta) -- en ese caso
  // ningun boton de preset queda marcado como activo. _dateFrom/_dateTo son siempre el rango
  // efectivo, tanto si vienen de un preset como si son manuales.
  private readonly _preset = signal<ReportRangePreset | null>('today');
  private readonly _dateFrom = signal<Date>(rangeForPreset('today').from);
  private readonly _dateTo = signal<Date>(rangeForPreset('today').to);
  private readonly _summary = signal<SalesSummary | null>(null);
  private readonly _topProducts = signal<TopProduct[]>([]);
  private readonly _loading = signal(false);

  readonly preset = this._preset.asReadonly();
  readonly dateFrom = this._dateFrom.asReadonly();
  readonly dateTo = this._dateTo.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly topProducts = this._topProducts.asReadonly();
  readonly loading = this._loading.asReadonly();

  async setPreset(preset: ReportRangePreset): Promise<void> {
    const { from, to } = rangeForPreset(preset);
    this._preset.set(preset);
    this._dateFrom.set(from);
    this._dateTo.set(to);
    await this.load();
  }

  async setDateFrom(date: Date | null): Promise<void> {
    if (!date) return;
    this._preset.set(null);
    this._dateFrom.set(startOfDay(date));
    await this.load();
  }

  async setDateTo(date: Date | null): Promise<void> {
    if (!date) return;
    this._preset.set(null);
    this._dateTo.set(startOfDay(date));
    await this.load();
  }

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const from = this._dateFrom();
    const to = nextDay(this._dateTo());

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
