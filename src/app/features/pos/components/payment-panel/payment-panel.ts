import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { TicketData } from '../../../../shared/components/ticket-print/ticket-print';
import { CashSessionStore } from '../../../cash-register/state/cash-session.store';
import { DEFAULT_TICKET_SETTINGS } from '../../../settings/data-access/models';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { CustomersStore } from '../../../customers/state/customers.store';
import { DeliveryTypesStore } from '../../../settings/state/delivery-types.store';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { PosStore } from '../../state/pos.store';

type PayStep = 'method' | 'cash';

// Sugerencias de "con cuanto paga" para el paso de efectivo: el total redondeado (por si
// paga justo) mas los billetes de mas arriba, sin repetir. Se recalculan solos con el total
// de la venta en vez de ser un set fijo, para no ofrecer un boton por debajo de lo que hay
// que cobrar.
function quickCashAmounts(total: number): number[] {
  if (total <= 0) return [];
  const roundedTotal = Math.ceil(total);
  const billSteps = [500, 1000, 2000, 5000, 10000, 20000];
  const amounts = new Set<number>([roundedTotal]);
  for (const step of billSteps) {
    amounts.add(Math.ceil(roundedTotal / step) * step);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, 4);
}

// Orden preferido en el popup de pago: Efectivo primero (es el mas usado en mostrador),
// despues los medios "estandar" en un orden fijo. Cualquier medio que el negocio haya
// creado con otro nombre cae al final, ordenado alfabetico entre si -- asi no se rompe
// si tienen medios de pago propios ademas de estos cuatro.
const PAYMENT_METHOD_ORDER = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

function paymentMethodRank(name: string): number {
  const index = PAYMENT_METHOD_ORDER.indexOf(name.trim().toLowerCase());
  return index === -1 ? PAYMENT_METHOD_ORDER.length : index;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-payment-panel',
  imports: [DecimalPipe, FormsModule, RouterLink, ButtonModule, DialogModule, InputNumberModule, SelectModule, TooltipModule],
  templateUrl: './payment-panel.html'
})
export class PaymentPanel {
  protected readonly store = inject(PosStore);
  protected readonly paymentMethodsStore = inject(PaymentMethodsStore);
  protected readonly deliveryTypesStore = inject(DeliveryTypesStore);
  protected readonly customersStore = inject(CustomersStore);
  protected readonly cashSessionStore = inject(CashSessionStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);

  protected readonly errorMessage = signal<string | null>(null);
  readonly saleConfirmed = output<TicketData>();

  protected readonly payDialogVisible = signal(false);
  protected readonly payStep = signal<PayStep>('method');

  protected readonly activePaymentMethods = computed(() =>
    this.paymentMethodsStore
      .paymentMethods()
      .filter((m) => m.active)
      .sort((a, b) => paymentMethodRank(a.name) - paymentMethodRank(b.name) || a.name.localeCompare(b.name))
  );

  protected readonly activeDeliveryTypes = computed(() =>
    this.deliveryTypesStore.deliveryTypes().filter((d) => d.active)
  );

  // La caja es opcional por negocio (Configuracion > Negocio) -- si esta desactivada, el
  // efectivo se cobra siempre, sin importar si hay turno abierto (mismo criterio que
  // process_sale del lado del server).
  protected readonly cashPaymentBlocked = computed(
    () => this.businessSettingsStore.business()?.cashRegisterEnabled !== false && !this.cashSessionStore.hasOpenSession()
  );

  protected readonly quickAmounts = computed(() => quickCashAmounts(this.store.total()));

  constructor() {
    this.paymentMethodsStore.load();
    this.deliveryTypesStore.load();
    this.customersStore.load();
    // Para deshabilitar "Efectivo" en el popup de pago si no hay turno abierto -- ver
    // .html. La caja NUNCA bloquea otros medios de pago, esto es solo UX proactiva: el
    // bloqueo real esta en process_sale (server-side), esto evita el viaje redondo con
    // error crudo cuando ya se armo todo el carrito.
    this.cashSessionStore.loadCurrent();

    // El cajero no elige tipo de entrega en la mayoria de las ventas (retiro en el mostrador
    // es el caso comun) -- se precarga solo para que nunca sea un paso obligatorio a pensar,
    // pero sigue siendo editable por si la venta es con envio.
    effect(() => {
      const types = this.activeDeliveryTypes();
      if (types.length === 0 || this.store.deliveryTypeId() !== null) return;
      const defaultType = types.find((d) => d.name === 'Retiro en local') ?? types[0];
      this.store.setDeliveryType(defaultType.id);
    });
  }

  protected openPayment(): void {
    this.errorMessage.set(null);
    this.payStep.set('method');
    this.payDialogVisible.set(true);
  }

  protected closePayment(): void {
    this.payDialogVisible.set(false);
  }

  protected backToMethod(): void {
    this.payStep.set('method');
  }

  protected onSelectMethod(methodId: string): void {
    this.store.setPaymentMethod(methodId);
    if (this.store.isCashPayment()) {
      this.payStep.set('cash');
    } else {
      this.runConfirm();
    }
  }

  protected onQuickAmount(amount: number): void {
    this.store.setCashReceived(amount);
  }

  protected onCashConfirm(): void {
    this.runConfirm();
  }

  private async runConfirm(): Promise<void> {
    this.errorMessage.set(null);

    // Se captura antes de confirmar: confirmSale() vacia el carrito y el cliente seleccionado
    // apenas resuelve, asi que despues no quedaria de donde sacar el detalle para el ticket.
    const items = this.store
      .cart()
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
        subtotal: item.product.price * item.quantity
      }));
    const paymentMethodName = this.store.selectedPaymentMethod()?.name ?? '';
    const customerName = this.customersStore.customers().find((c) => c.id === this.store.customerId())?.name ?? null;
    const business = this.businessSettingsStore.business();
    const ticketSettings = business?.ticketSettings ?? DEFAULT_TICKET_SETTINGS;

    try {
      const result = await this.store.confirmSale();
      this.payDialogVisible.set(false);
      this.saleConfirmed.emit({
        businessName: business?.name ?? '',
        businessAddress: business?.address ?? null,
        businessPhone: business?.phone ?? null,
        headerText: ticketSettings.headerText,
        footerText: ticketSettings.footerText,
        paperWidthMm: ticketSettings.paperWidthMm,
        saleNumber: result.saleNumber,
        date: new Date(),
        customerName,
        paymentMethodName,
        items,
        subtotal: result.subtotal,
        discountAmount: result.discountAmount,
        total: result.total,
        changeGiven: result.changeGiven
      });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo confirmar la venta.');
    }
  }
}
