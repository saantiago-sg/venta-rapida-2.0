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
  // Linea libre opcional arriba de los datos del negocio (slogan, mensaje corto) -- no
  // reemplaza nombre/direccion/telefono, se suma antes.
  headerText: string | null;
  // Reemplaza el "Gracias por su compra" que antes estaba fijo en el template; el default
  // ("Gracias por su compra") vive en TicketSettings, no aca, para tener una sola fuente.
  footerText: string | null;
  paperWidthMm: 58 | 80;
  saleNumber: number;
  date: Date;
  customerName: string | null;
  paymentMethodName: string;
  items: TicketLineItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  changeGiven: number | null;
  // true cuando se vendio sin conexion y todavia no tiene numero de venta real asignado
  // (se asigna recien al sincronizar) -- ver OfflineQueueService/SyncService.
  pending?: boolean;
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
