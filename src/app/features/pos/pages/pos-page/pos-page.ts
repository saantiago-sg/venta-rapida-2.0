import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

import { TicketData, TicketPrint } from '../../../../shared/components/ticket-print/ticket-print';
import { ProductsStore } from '../../../products/state/products.store';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { Cart } from '../../components/cart/cart';
import { PaymentPanel } from '../../components/payment-panel/payment-panel';
import { ProductSearch } from '../../components/product-search/product-search';

@Component({
  selector: 'app-pos-page',
  imports: [DecimalPipe, DialogModule, ButtonModule, ProductSearch, Cart, PaymentPanel, TicketPrint],
  templateUrl: './pos-page.html'
})
export class PosPage {
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly productsStore = inject(ProductsStore);

  protected readonly lastSale = signal<TicketData | null>(null);
  protected readonly confirmationVisible = signal(false);

  constructor() {
    this.businessSettingsStore.load();
  }

  protected onSaleConfirmed(ticket: TicketData): void {
    this.lastSale.set(ticket);
    this.confirmationVisible.set(true);
    this.productsStore.load();
    // Se difiere un tick para que el <app-ticket-print> ya haya renderizado el ticket nuevo
    // en el DOM antes de que window.print() lo capture.
    setTimeout(() => this.onPrint());
  }

  protected onPrint(): void {
    window.print();
  }
}
