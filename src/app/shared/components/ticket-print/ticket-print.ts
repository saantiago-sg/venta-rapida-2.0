import { Component, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

export interface TicketLineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface TicketData {
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  saleNumber: number;
  date: Date;
  customerName: string | null;
  paymentMethodName: string;
  items: TicketLineItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  changeGiven: number | null;
}

// Se queda siempre montado (oculto en pantalla) y solo se hace visible via CSS de @media print
// -- window.print() imprime la pagina completa, asi que el aislamiento de "imprimir solo esto"
// lo hace la regla global en styles.css (".ticket-print-root" + visibility), no este componente.
@Component({
  selector: 'app-ticket-print',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './ticket-print.html'
})
export class TicketPrint {
  readonly data = input<TicketData | null>(null);
}
