import { Component, computed, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';

import { CustomersStore } from '../../../customers/state/customers.store';
import { DeliveryTypesStore } from '../../../settings/state/delivery-types.store';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { SaleResult } from '../../data-access/models';
import { PosStore } from '../../state/pos.store';

@Component({
  selector: 'app-payment-panel',
  imports: [DecimalPipe, FormsModule, ButtonModule, InputNumberModule, SelectModule],
  templateUrl: './payment-panel.html'
})
export class PaymentPanel {
  protected readonly store = inject(PosStore);
  protected readonly paymentMethodsStore = inject(PaymentMethodsStore);
  protected readonly deliveryTypesStore = inject(DeliveryTypesStore);
  protected readonly customersStore = inject(CustomersStore);

  protected readonly errorMessage = signal<string | null>(null);
  readonly saleConfirmed = output<SaleResult>();

  protected readonly activePaymentMethods = computed(() =>
    this.paymentMethodsStore.paymentMethods().filter((m) => m.active)
  );

  protected readonly activeDeliveryTypes = computed(() =>
    this.deliveryTypesStore.deliveryTypes().filter((d) => d.active)
  );

  constructor() {
    this.paymentMethodsStore.load();
    this.deliveryTypesStore.load();
    this.customersStore.load();
  }

  protected async onConfirm(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const result = await this.store.confirmSale();
      this.saleConfirmed.emit(result);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo confirmar la venta.');
    }
  }
}
