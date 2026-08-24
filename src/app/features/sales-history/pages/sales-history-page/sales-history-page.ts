import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { TicketData, TicketPrint } from '../../../../shared/components/ticket-print/ticket-print';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { SaleListItem } from '../../data-access/models';
import { SalesHistoryStore, formatLocalDate, parseLocalDate } from '../../state/sales-history.store';

@Component({
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
  protected readonly retryingInvoice = signal(false);

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
    return {
      businessName: business?.name ?? '',
      businessAddress: business?.address ?? null,
      businessPhone: business?.phone ?? null,
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
    this.store.load();
    this.paymentMethodsStore.load();
    this.businessSettingsStore.load();
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

  protected onPrint(): void {
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

  protected async onRetryInvoice(): Promise<void> {
    const sale = this.selectedSale();
    if (!sale) return;

    this.retryingInvoice.set(true);
    try {
      await this.store.retryInvoice(sale.id);
      const refreshed = this.store.sales().find((s) => s.id === sale.id);
      if (refreshed) this.selectedSale.set(refreshed);
    } finally {
      this.retryingInvoice.set(false);
    }
  }

  protected onViewInvoice(sale: SaleListItem): void {
    const url = sale.invoice?.pdfUrl ?? sale.invoice?.ticketUrl;
    if (url) window.open(url, '_blank', 'noopener');
  }
}
