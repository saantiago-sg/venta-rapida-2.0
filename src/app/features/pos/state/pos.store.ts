import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { isNetworkError } from '../../../core/offline/network-error';
import { OfflineQueueService } from '../../../core/offline/offline-queue.service';
import { Product } from '../../products/data-access/models';
import { BusinessSettingsStore } from '../../settings/state/business-settings.store';
import { PaymentMethodsStore } from '../../settings/state/payment-methods.store';
import { SaleRepository } from '../data-access/sale.repository';
import { CartItem, ProcessSaleInput, SaleResult } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class PosStore {
  private readonly saleRepository = inject(SaleRepository);
  private readonly authStore = inject(AuthStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly paymentMethodsStore = inject(PaymentMethodsStore);
  private readonly offlineQueue = inject(OfflineQueueService);

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

  // Ganancia del pedido actual (precio - costo por linea) -- mismo criterio que se usa en
  // Historial de ventas y en la tabla de Productos, para que el numero sea consistente en
  // toda la app.
  readonly profit = computed(() =>
    this._cart().reduce((sum, item) => sum + (item.product.price - item.product.cost) * item.quantity, 0)
  );

  readonly marginPercent = computed(() => {
    const subtotal = this.subtotal();
    return subtotal > 0 ? (this.profit() / subtotal) * 100 : 0;
  });

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

    // Se genera antes de intentar: si el pedido nunca vuelve (se corta la conexion justo
    // despues de que el server ya guardo todo) sirve para no duplicar la venta al reintentar
    // -- ver idempotencia en process_sale.
    const clientReference = crypto.randomUUID();
    const input: ProcessSaleInput = {
      businessId,
      items: this._cart()
        .filter((item) => item.quantity > 0)
        .map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.price,
          unit_cost: item.product.cost,
          tax_rate: item.product.taxRate ?? 0
        })),
      paymentMethodId,
      deliveryTypeId,
      customerId: this._customerId(),
      cashReceived: this._cashReceived(),
      clientReference
    };

    this._processing.set(true);
    try {
      const result = await this.saleRepository.processSale(input);

      this._cart.set([]);
      this._cashReceived.set(null);
      this._customerId.set(null);
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return this.confirmSaleOffline(input, clientReference);
    } finally {
      this._processing.set(false);
    }
  }

  // Sin conexion: la venta se da por confirmada del lado del cajero (el ticket se imprime
  // igual, marcado como pendiente) y queda encolada para reintentar sola apenas vuelva la
  // conexion -- nunca lo deja bloqueado en el mostrador esperando el wifi. El total ya sale
  // calculado con el descuento por efectivo vigente porque se lee de los signals de este
  // store antes de vaciar el carrito, no se recalcula de cero.
  private async confirmSaleOffline(input: ProcessSaleInput, clientReference: string): Promise<SaleResult> {
    const result: SaleResult = {
      id: clientReference,
      saleNumber: 0,
      subtotal: this.subtotal(),
      discountAmount: this.discount(),
      total: this.total(),
      changeGiven: this.changeDue(),
      pending: true
    };

    await this.offlineQueue.enqueue({ clientReference, input, createdAt: new Date().toISOString() });

    this._cart.set([]);
    this._cashReceived.set(null);
    this._customerId.set(null);
    return result;
  }
}
