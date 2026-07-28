import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { Product } from '../../products/data-access/models';
import { BusinessSettingsStore } from '../../settings/state/business-settings.store';
import { PaymentMethodsStore } from '../../settings/state/payment-methods.store';
import { SaleRepository } from '../data-access/sale.repository';
import { CartItem, SaleResult } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class PosStore {
  private readonly saleRepository = inject(SaleRepository);
  private readonly authStore = inject(AuthStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly paymentMethodsStore = inject(PaymentMethodsStore);

  private readonly _cart = signal<CartItem[]>([]);
  private readonly _paymentMethodId = signal<string | null>(null);
  private readonly _deliveryTypeId = signal<string | null>(null);
  private readonly _customerId = signal<string | null>(null);
  private readonly _cashReceived = signal<number | null>(null);
  private readonly _processing = signal(false);

  readonly cart = this._cart.asReadonly();
  readonly paymentMethodId = this._paymentMethodId.asReadonly();
  readonly deliveryTypeId = this._deliveryTypeId.asReadonly();
  readonly customerId = this._customerId.asReadonly();
  readonly cashReceived = this._cashReceived.asReadonly();
  readonly processing = this._processing.asReadonly();

  readonly subtotal = computed(() =>
    this._cart().reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

  readonly selectedPaymentMethod = computed(() =>
    this.paymentMethodsStore.paymentMethods().find((m) => m.id === this._paymentMethodId()) ?? null
  );

  readonly isCashPayment = computed(() => this.selectedPaymentMethod()?.isCash ?? false);

  readonly discount = computed(() => {
    if (!this.isCashPayment()) return 0;
    const pct = this.businessSettingsStore.business()?.cashDiscountPercentage ?? 0;
    return Math.round(this.subtotal() * pct) / 100;
  });

  readonly total = computed(() => this.subtotal() - this.discount());

  readonly changeDue = computed(() => {
    const received = this._cashReceived();
    if (received === null) return null;
    return received - this.total();
  });

  readonly canConfirm = computed(
    () =>
      this._cart().length > 0 &&
      this._paymentMethodId() !== null &&
      this._deliveryTypeId() !== null &&
      !this._processing()
  );

  addToCart(product: Product): void {
    this._cart.update((items) => {
      const existing = items.find((i) => i.product.id === product.id);
      if (existing && product.saleType === 'unit') {
        return items.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...items, { product, quantity: 1 }];
    });
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }
    this._cart.update((items) => items.map((i) => (i.product.id === productId ? { ...i, quantity } : i)));
  }

  removeFromCart(productId: string): void {
    this._cart.update((items) => items.filter((i) => i.product.id !== productId));
  }

  setPaymentMethod(id: string | null): void {
    this._paymentMethodId.set(id);
    if (!this.isCashPayment()) this._cashReceived.set(null);
  }

  setDeliveryType(id: string | null): void {
    this._deliveryTypeId.set(id);
  }

  setCustomer(id: string | null): void {
    this._customerId.set(id);
  }

  setCashReceived(amount: number | null): void {
    this._cashReceived.set(amount);
  }

  async confirmSale(): Promise<SaleResult> {
    const businessId = this.authStore.activeBusinessId();
    const paymentMethodId = this._paymentMethodId();
    const deliveryTypeId = this._deliveryTypeId();
    if (!businessId || !paymentMethodId || !deliveryTypeId) {
      throw new Error('Faltan datos para confirmar la venta');
    }

    this._processing.set(true);
    try {
      const result = await this.saleRepository.processSale({
        businessId,
        items: this._cart().map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
        paymentMethodId,
        deliveryTypeId,
        customerId: this._customerId(),
        cashReceived: this._cashReceived()
      });

      this._cart.set([]);
      this._cashReceived.set(null);
      this._customerId.set(null);
      return result;
    } finally {
      this._processing.set(false);
    }
  }
}
