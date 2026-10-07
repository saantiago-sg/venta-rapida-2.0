import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

import { TicketData, TicketPrint } from '../../../../shared/components/ticket-print/ticket-print';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { Cart } from '../../components/cart/cart';
import { PaymentPanel } from '../../components/payment-panel/payment-panel';
import { ProductSearch } from '../../components/product-search/product-search';
import { PosStore } from '../../state/pos.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pos-page',
  imports: [DecimalPipe, DialogModule, ButtonModule, ProductSearch, Cart, PaymentPanel, TicketPrint],
  templateUrl: './pos-page.html'
})
export class PosPage {
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  protected readonly posStore = inject(PosStore);
  private readonly productSearch = viewChild(ProductSearch);

  protected readonly lastSale = signal<TicketData | null>(null);
  protected readonly confirmationVisible = signal(false);
  // Nunca se imprime solo (casi ningun cliente quiere el ticket y gastaba papel, ver
  // TicketSettings): el boton del dialogo dice "Imprimir" y pasa a "Reimprimir" recien despues
  // de que el ticket salio una vez.
  protected readonly ticketPrinted = signal(false);
  // Pestañas Buscar/Pedido -- solo se ven debajo de lg (ver pos-page.html), en desktop el
  // grid de 3 columnas de siempre ignora este signal.
  protected readonly mobileTab = signal<'buscar' | 'pedido'>('buscar');

  constructor() {
    this.businessSettingsStore.load();
  }

  protected onSaleConfirmed(ticket: TicketData): void {
    this.lastSale.set(ticket);
    this.ticketPrinted.set(false);
    this.confirmationVisible.set(true);
    this.mobileTab.set('buscar');
    // El descuento de stock ya se aplica en PosStore.confirmSale() sin pedir el catalogo de
    // nuevo (ver ProductsStore.applyStockDelta) -- no hace falta nada aca.
  }

  protected onPrint(): void {
    this.ticketPrinted.set(true);
    window.print();
  }

  // El dialogo de "Venta confirmada" atrapa el foco mientras esta abierto -- al cerrarse el
  // navegador lo manda a <body> si no se lo devuelve a mano al buscador.
  protected onConfirmationVisibleChange(visible: boolean): void {
    this.confirmationVisible.set(visible);
    if (!visible) this.productSearch()?.focusSearch();
  }
}
