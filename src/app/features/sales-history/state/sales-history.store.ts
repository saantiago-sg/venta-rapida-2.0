import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { ReportsRepository } from '../../reports/data-access/reports.repository';
import { SalesSummary } from '../../reports/data-access/models';
import { SalesHistoryFilters, SalesHistoryRepository } from '../data-access/sales-history.repository';
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

  // Pago y N° de pedido ahora se filtran en el servidor (junto con la paginacion), no en el
  // cliente sobre una lista ya traida entera -- ver el comentario en list() del repositorio.
  private readonly _totalCount = signal(0);
  private readonly _first = signal(0);
  private readonly _rows = signal(25);
  private orderNumberDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly loading = this._loading.asReadonly();
  readonly selectedItems = this._selectedItems.asReadonly();
  readonly itemsLoading = this._itemsLoading.asReadonly();
  readonly dateFrom = this._dateFrom.asReadonly();
  readonly dateTo = this._dateTo.asReadonly();
  readonly paymentMethodId = this._paymentMethodId.asReadonly();
  readonly orderNumberQuery = this._orderNumberQuery.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly sales = this._sales.asReadonly();
  readonly totalCount = this._totalCount.asReadonly();
  readonly first = this._first.asReadonly();
  readonly rows = this._rows.asReadonly();

  readonly averageMargin = computed(() => {
    const s = this._summary();
    if (!s || s.totalSales === 0) return 0;
    return (s.totalProfit / s.totalSales) * 100;
  });

  private get filters(): SalesHistoryFilters {
    return { paymentMethodId: this._paymentMethodId(), orderNumberQuery: this._orderNumberQuery() };
  }

  private get dateRange(): { from: Date; to: Date } {
    const from = this._dateFrom() ? parseLocalDate(this._dateFrom()!) : EARLIEST_POSSIBLE_SALE;
    // limite superior exclusivo: "Hasta 6 de agosto" tiene que incluir todo ese dia
    const to = this._dateTo() ? nextDay(parseLocalDate(this._dateTo()!)) : nextDay(new Date());
    return { from, to };
  }

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const { from, to } = this.dateRange;

    this._loading.set(true);
    try {
      const [page, summary] = await Promise.all([
        this.repository.list(businessId, from, to, this.filters, { first: this._first(), rows: this._rows() }),
        this.reportsRepository.getSummary(businessId, from, to)
      ]);
      this._sales.set(page.items);
      this._totalCount.set(page.totalCount);
      this._summary.set(summary);
    } finally {
      this._loading.set(false);
    }
  }

  // Trae TODO lo que matchea los filtros actuales, sin paginar -- para exportar. Lo que se ve
  // en pantalla es solo una pagina, pero exportar tiene que reflejar todo lo filtrado (ver
  // comentario en sales-history-page.ts).
  async loadAllForExport(): Promise<SaleListItem[]> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return [];

    const { from, to } = this.dateRange;
    const page = await this.repository.list(businessId, from, to, this.filters);
    return page.items;
  }

  // Llamado desde (onLazyLoad) del p-table -- ahí vive el estado real de pagina/tamaño de
  // pagina que el usuario esta viendo.
  setPage(first: number, rows: number): void {
    this._first.set(first);
    this._rows.set(rows);
    this.load();
  }

  setDateFrom(value: string | null): void {
    this._dateFrom.set(value || null);
    this._first.set(0);
    this.load();
  }

  setDateTo(value: string | null): void {
    this._dateTo.set(value || null);
    this._first.set(0);
    this.load();
  }

  setPaymentMethodId(value: string | null): void {
    this._paymentMethodId.set(value || null);
    this._first.set(0);
    this.load();
  }

  // Debounced: es un input de texto, tipear caracter a caracter no puede disparar un
  // request al servidor por cada tecla.
  setOrderNumberQuery(value: string): void {
    this._orderNumberQuery.set(value);
    this._first.set(0);
    if (this.orderNumberDebounce) clearTimeout(this.orderNumberDebounce);
    this.orderNumberDebounce = setTimeout(() => this.load(), 300);
  }

  clearDateFilter(): void {
    this._dateFrom.set(null);
    this._dateTo.set(null);
    this._first.set(0);
    this.load();
  }

  clearAllFilters(): void {
    if (this.orderNumberDebounce) clearTimeout(this.orderNumberDebounce);
    this._dateFrom.set(null);
    this._dateTo.set(null);
    this._paymentMethodId.set(null);
    this._orderNumberQuery.set('');
    this._first.set(0);
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
}
