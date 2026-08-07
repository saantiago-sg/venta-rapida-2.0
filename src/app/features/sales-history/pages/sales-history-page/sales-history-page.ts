import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { SaleListItem } from '../../data-access/models';
import { SalesHistoryStore } from '../../state/sales-history.store';

@Component({
  selector: 'app-sales-history-page',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    CountUpDirective
  ],
  templateUrl: './sales-history-page.html'
})
export class SalesHistoryPage {
  protected readonly store = inject(SalesHistoryStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly paymentMethodsStore = inject(PaymentMethodsStore);

  protected readonly detailVisible = signal(false);
  protected readonly selectedSale = signal<SaleListItem | null>(null);
  protected readonly cancelReason = signal('');
  protected readonly cancelling = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly paymentOptions = computed(() =>
    this.paymentMethodsStore
      .paymentMethods()
      .filter((m) => m.active)
      .map((m) => ({ label: m.name, value: m.id }))
  );

  constructor() {
    this.store.load();
    this.paymentMethodsStore.load();
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

  protected async onCancel(): Promise<void> {
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
