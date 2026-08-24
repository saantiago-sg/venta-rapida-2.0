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
  private readonly _invoiceNotice = signal<string | null>(null);

  readonly cart = this._cart.asReadonly();
  readonly paymentMethodId = this._paymentMethodId.asReadonly();
  readonly deliveryTypeId = this._deliveryTypeId.asReadonly();
  readonly customerId = this._customerId.asReadonly();
  readonly cashReceived = this._cashReceived.asReadonly();
  readonly processing = this._processing.asReadonly();
  // Aviso liviano post-venta (ej. "no se pudo facturar") -- nunca bloquea el checkout, la venta
  // ya quedo guardada antes de que esto se dispare. null cuando no hay nada para mostrar.
  readonly invoiceNotice = this._invoiceNotice.asReadonly();

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

  // Habilita el boton que abre el popup de pago -- todavia no hace falta un medio de pago
  // elegido, eso se elige recien adentro del popup.
  readonly canStartPayment = computed(
    () => this._cart().some((item) => item.quantity > 0) && this._deliveryTypeId() !== null && !this._processing()
  );

  readonly canConfirm = computed(
    () =>
      this._cart().some((item) => item.quantity > 0) &&
      this._paymentMethodId() !== null &&
      this._deliveryTypeId() !== null &&
      !this._processing()
  );

  addToCart(product: Product, quantity = 1): void {
    this._cart.update((items) => {
      const existing = items.find((i) => i.product.id === product.id);
      if (existing && product.saleType === 'unit') {
        return items.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...items, { product, quantity }];
    });
  }

  // No se saca el item del carrito solo por llegar a 0/vacio -- pasa todo el tiempo al
  // borrar el campo para retipear un peso nuevo, y que el item "desaparezca" en el medio
  // de esa edicion es confuso. Sacarlo del carrito queda reservado al boton de borrar
  // explicito; los items en 0 simplemente no suman al total ni se mandan a confirmar.
  updateQuantity(productId: string, quantity: number): void {
    const safeQuantity = Math.max(0, quantity || 0);
    this._cart.update((items) =>
      items.map((i) => (i.product.id === productId ? { ...i, quantity: safeQuantity } : i))
    );
  }

  removeFromCart(productId: string): void {
    this._cart.update((items) => items.filter((i) => i.product.id !== productId));
  }

  clearCart(): void {
    this._cart.set([]);
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
        items: this._cart()
          .filter((item) => item.quantity > 0)
          .map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
        paymentMethodId,
        deliveryTypeId,
        customerId: this._customerId(),
        cashReceived: this._cashReceived()
      });

      this._cart.set([]);
      this._cashReceived.set(null);
      this._customerId.set(null);
      this.triggerInvoicing(result.id);
      return result;
    } finally {
      this._processing.set(false);
    }
  }

  // Se dispara sin esperar (no bloquea el ticket/la confirmacion en pantalla) -- si falla o esta
  // deshabilitada, se resuelve en silencio salvo error real, que se muestra como aviso liviano.
  private triggerInvoicing(saleId: string): void {
    this._invoiceNotice.set(null);
    this.saleRepository
      .invoiceSale(saleId)
      .then((res) => {
        if (res.skipped || res.invoiced) return;
        this._invoiceNotice.set('No se pudo facturar la venta. Podés reintentar desde Ventas.');
      })
      .catch(() => this._invoiceNotice.set('No se pudo facturar la venta. Podés reintentar desde Ventas.'));
  }

  dismissInvoiceNotice(): void {
    this._invoiceNotice.set(null);
  }
}
