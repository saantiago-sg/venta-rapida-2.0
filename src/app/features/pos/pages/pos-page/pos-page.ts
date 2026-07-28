import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

import { ProductsStore } from '../../../products/state/products.store';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { Cart } from '../../components/cart/cart';
import { PaymentPanel } from '../../components/payment-panel/payment-panel';
import { ProductSearch } from '../../components/product-search/product-search';
import { SaleResult } from '../../data-access/models';

@Component({
  selector: 'app-pos-page',
  imports: [DecimalPipe, DialogModule, ButtonModule, ProductSearch, Cart, PaymentPanel],
  templateUrl: './pos-page.html'
})
export class PosPage {
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly productsStore = inject(ProductsStore);

  protected readonly lastSale = signal<SaleResult | null>(null);
  protected readonly confirmationVisible = signal(false);

  constructor() {
    this.businessSettingsStore.load();
  }

  protected onSaleConfirmed(result: SaleResult): void {
    this.lastSale.set(result);
    this.confirmationVisible.set(true);
    this.productsStore.load();
  }
}
