import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsRepository } from '../../reports/data-access/reports.repository';
import { SalesSummary } from '../../reports/data-access/models';
import { SalesHistoryRepository } from '../data-access/sales-history.repository';
import { SaleItem, SaleListItem } from '../data-access/models';

// Parseo a mano en vez de "new Date('yyyy-mm-dd')": ese formato lo interpreta como UTC,
// lo que corre el dia en zonas horarias negativas (Argentina, UTC-3) -- "Desde: 6 de agosto"
// terminaria incluyendo parte del 5 de agosto a la noche. Con año/mes/dia sueltos, Date
// arma la fecha en el huso horario local, que es lo que el usuario espera.
export function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Inversa de parseLocalDate: arma el string 'yyyy-mm-dd' a partir de los componentes locales
// del Date, sin pasar por toISOString() (que convierte a UTC y puede correr el dia).
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

// Rango por defecto cuando no hay filtro de fecha: "todo el historial". No hay una fecha real
// de "negocio creado" a mano en este store, asi que se usa una cota bien vieja en vez de null
// -- simplifica el resto del codigo al no tener que ramificar "con fecha" vs "sin fecha".
const EARLIEST_POSSIBLE_SALE = new Date(2020, 0, 1);

@Injectable({ providedIn: 'root' })
export class SalesHistoryStore {
  private readonly repository = inject(SalesHistoryRepository);
  private readonly reportsRepository = inject(ReportsRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _sales = signal<SaleListItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _selectedItems = signal<SaleItem[]>([]);
  private readonly _itemsLoading = signal(false);
  // Por defecto se abre mostrando el dia de hoy (no todo el historial) -- es lo que se
  // quiere ver la mayoria de las veces al entrar a la pantalla.
  private readonly _dateFrom = signal<string | null>(formatLocalDate(new Date()));
  private readonly _dateTo = signal<string | null>(formatLocalDate(new Date()));
  private readonly _paymentMethodId = signal<string | null>(null);
  private readonly _orderNumberQuery = signal('');
  private readonly _summary = signal<SalesSummary | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly selectedItems = this._selectedItems.asReadonly();
  readonly itemsLoading = this._itemsLoading.asReadonly();
  readonly dateFrom = this._dateFrom.asReadonly();
  readonly dateTo = this._dateTo.asReadonly();
  readonly paymentMethodId = this._paymentMethodId.asReadonly();
  readonly orderNumberQuery = this._orderNumberQuery.asReadonly();
  readonly summary = this._summary.asReadonly();

  readonly averageMargin = computed(() => {
    const s = this._summary();
    if (!s || s.totalSales === 0) return 0;
    return (s.totalProfit / s.totalSales) * 100;
  });

  // Pago y N° de pedido se filtran en el cliente sobre lo que ya trajo el rango de fechas:
  // son listas chicas por negocio, no vale la pena otra ida y vuelta al servidor por esto.
  readonly sales = computed(() => {
    const paymentMethodId = this._paymentMethodId();
    const query = this._orderNumberQuery().trim();
    return this._sales().filter((sale) => {
      if (paymentMethodId && sale.paymentMethodId !== paymentMethodId) return false;
      if (query && !String(sale.saleNumber).includes(query)) return false;
      return true;
    });
  });

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const from = this._dateFrom() ? parseLocalDate(this._dateFrom()!) : EARLIEST_POSSIBLE_SALE;
    // limite superior exclusivo: "Hasta 6 de agosto" tiene que incluir todo ese dia
    const to = this._dateTo() ? nextDay(parseLocalDate(this._dateTo()!)) : nextDay(new Date());

    this._loading.set(true);
    try {
      const [sales, summary] = await Promise.all([
        this.repository.list(businessId, from, to),
        this.reportsRepository.getSummary(businessId, from, to)
      ]);
      this._sales.set(sales);
      this._summary.set(summary);
    } finally {
      this._loading.set(false);
    }
  }

  setDateFrom(value: string | null): void {
    this._dateFrom.set(value || null);
    this.load();
  }

  setDateTo(value: string | null): void {
    this._dateTo.set(value || null);
    this.load();
  }

  setPaymentMethodId(value: string | null): void {
    this._paymentMethodId.set(value || null);
  }

  setOrderNumberQuery(value: string): void {
    this._orderNumberQuery.set(value);
  }

  clearDateFilter(): void {
    this._dateFrom.set(null);
    this._dateTo.set(null);
    this.load();
  }

  clearAllFilters(): void {
    this._dateFrom.set(null);
    this._dateTo.set(null);
    this._paymentMethodId.set(null);
    this._orderNumberQuery.set('');
    this.load();
  }

  readonly hasActiveFilters = computed(
    () => !!(this._dateFrom() || this._dateTo() || this._paymentMethodId() || this._orderNumberQuery().trim())
  );

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

  async retryInvoice(saleId: string): Promise<void> {
    await this.repository.retryInvoice(saleId);
    await this.load();
  }
}
