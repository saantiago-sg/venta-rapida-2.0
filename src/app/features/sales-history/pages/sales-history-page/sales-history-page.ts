import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { TicketData, TicketPrint } from '../../../../shared/components/ticket-print/ticket-print';
import { DEFAULT_TICKET_SETTINGS } from '../../../settings/data-access/models';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { SaleListItem } from '../../data-access/models';
import { exportSalesCsv, exportSalesExcel, exportSalesPdf } from '../../data-access/sales-export';
import { SalesHistoryStore, formatLocalDate, parseLocalDate } from '../../state/sales-history.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sales-history-page',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    SplitButtonModule,
    TableModule,
    TagModule,
    CountUpDirective,
    TicketPrint
  ],
  providers: [ConfirmationService],
  templateUrl: './sales-history-page.html'
})
export class SalesHistoryPage {
  protected readonly store = inject(SalesHistoryStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly paymentMethodsStore = inject(PaymentMethodsStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly confirmationService = inject(ConfirmationService);

  // El datepicker de PrimeNG trabaja con Date, pero el store guarda 'yyyy-mm-dd' (mismo
  // formato que ya esperan load()/repository) -- se convierte acá en los dos sentidos.
  protected readonly dateFromValue = computed(() => {
    const value = this.store.dateFrom();
    return value ? parseLocalDate(value) : null;
  });
  protected readonly dateToValue = computed(() => {
    const value = this.store.dateTo();
    return value ? parseLocalDate(value) : null;
  });

  protected onDateFromChange(date: Date | null): void {
    this.store.setDateFrom(date ? formatLocalDate(date) : null);
  }

  protected onDateToChange(date: Date | null): void {
    this.store.setDateTo(date ? formatLocalDate(date) : null);
  }

  protected readonly detailVisible = signal(false);
  protected readonly selectedSale = signal<SaleListItem | null>(null);
  protected readonly cancelReason = signal('');
  protected readonly cancelling = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly exporting = signal(false);
  protected readonly exportOptions: MenuItem[] = [
    { label: 'CSV', icon: 'pi pi-file', command: () => this.onExportCsv() },
    { label: 'Excel', icon: 'pi pi-file-excel', command: () => this.onExportExcel() },
    { label: 'PDF', icon: 'pi pi-file-pdf', command: () => this.onExportPdf() }
  ];

  protected readonly paymentOptions = computed(() =>
    this.paymentMethodsStore
      .paymentMethods()
      .filter((m) => m.active)
      .map((m) => ({ label: m.name, value: m.id }))
  );

  protected readonly ticketData = computed<TicketData | null>(() => {
    const sale = this.selectedSale();
    if (!sale) return null;
    const business = this.businessSettingsStore.business();
    const ticketSettings = business?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;
    return {
      businessName: business?.name ?? '',
      businessAddress: business?.address ?? null,
      businessPhone: business?.phone ?? null,
      headerText: ticketSettings.headerText,
      footerText: ticketSettings.footerText,
      paperWidthMm: ticketSettings.paperWidthMm,
      saleNumber: sale.saleNumber,
      date: new Date(sale.createdAt),
      customerName: sale.customerName,
      paymentMethodName: sale.paymentMethodName,
      items: this.store.selectedItems().map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal
      })),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      total: sale.total,
      changeGiven: null
    };
  });

  constructor() {
    // El store.load() inicial de la lista de ventas NO va acá -- lo dispara solo el propio
    // p-table via (onLazyLoad) al montar (lazyLoadOnInit, default true de PrimeNG). Si se
    // llamara tambien acá, se pediria la primera pagina dos veces.
    this.paymentMethodsStore.load();
    this.businessSettingsStore.load();
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    this.store.setPage(event.first ?? 0, event.rows ?? 25);
  }

  protected marginPercent(sale: SaleListItem): number {
    if (sale.total <= 0) return 0;
    return (sale.profit / sale.total) * 100;
  }

  protected canCancelSales(): boolean {
    return this.authStore.hasPermission('can_cancel_sales');
  }

  protected openDetail(sale: SaleListItem): void {
    this.selectedSale.set(sale);
    this.cancelReason.set('');
    this.errorMessage.set(null);
    this.detailVisible.set(true);
    this.store.loadItems(sale.id);
  }

  protected onViewClick(sale: SaleListItem, event: Event): void {
    event.stopPropagation();
    this.openDetail(sale);
  }

  protected onPrint(): void {
    window.print();
  }

  // Los tres exports toman TODO lo que matchea los filtros actuales (fecha, medio de pago, N
  // de pedido), no solo la pagina que esta viendo el usuario en la tabla -- lo que ve el
  // usuario filtrado es lo que se exporta, sin excepciones, independiente de cuantas paginas
  // sean. Por eso piden su propia carga (store.loadAllForExport()) en vez de leer store.sales().
  protected async onExportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const sales = await this.store.loadAllForExport();
      exportSalesCsv(sales, this.store.dateFrom(), this.store.dateTo());
    } finally {
      this.exporting.set(false);
    }
  }

  protected async onExportExcel(): Promise<void> {
    this.exporting.set(true);
    try {
      const sales = await this.store.loadAllForExport();
      await exportSalesExcel(sales, this.store.dateFrom(), this.store.dateTo());
    } finally {
      this.exporting.set(false);
    }
  }

  protected async onExportPdf(): Promise<void> {
    this.exporting.set(true);
    try {
      const sales = await this.store.loadAllForExport();
      await exportSalesPdf(sales, this.store.dateFrom(), this.store.dateTo());
    } finally {
      this.exporting.set(false);
    }
  }

  // Reimprimir directo desde la fila (sin abrir el detalle) -- por si el cliente vuelve mas
  // tarde a pedir el comprobante de una venta ya cerrada.
  protected async onPrintClick(sale: SaleListItem, event: Event): Promise<void> {
    event.stopPropagation();
    this.selectedSale.set(sale);
    await this.store.loadItems(sale.id);
    window.print();
  }

  protected onCancelClick(): void {
    this.confirmationService.confirm({
      header: 'Cancelar venta',
      message: '¿Seguro que querés cancelar esta venta? Esta acción no se puede deshacer.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => this.onCancel()
    });
  }

  private async onCancel(): Promise<void> {
    const sale = this.selectedSale();
    if (!sale) return;

    this.cancelling.set(true);
    this.errorMessage.set(null);
    try {
      await this.store.cancel(sale.id, this.cancelReason() || null);
      this.detailVisible.set(false);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo cancelar la venta.');
    } finally {
      this.cancelling.set(false);
    }
  }
}
