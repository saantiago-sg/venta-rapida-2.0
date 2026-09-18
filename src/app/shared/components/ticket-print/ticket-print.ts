import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';

const MM_PER_PX = 25.4 / 96;
const PAGE_SIZE_STYLE_ID = 'ticket-print-page-size';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ticket-print',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './ticket-print.html'
})
export class TicketPrint {
  readonly data = input<TicketData | null>(null);

  private readonly root = viewChild<ElementRef<HTMLElement>>('root');

  constructor() {
    // 'beforeprint' dispara justo cuando el navegador ya aplico los estilos de @media print
    // (por eso .ticket-print-root ya esta en display:block y offsetHeight da un valor real,
    // no 0 como daria fuera de esa media query) -- se aprovecha ese momento para decirle a la
    // pagina que altura real tiene el ticket, en vez de dejar que el driver de la impresora
    // use su largo de hoja por defecto (ver @page en styles.css: sin esto, "size: 80mm auto"
    // solo lo respeta "Guardar como PDF", una impresora termica real como una POS-80-Series
    // ignora el "auto" y tira todo el largo de pagina default en blanco antes de cortar).
    window.addEventListener('beforeprint', () => this.applyPageSize());
  }

  private applyPageSize(): void {
    const sale = this.data();
    const element = this.root()?.nativeElement;
    if (!sale || !element) return;

    // +2mm de margen para que el corte automatico de la impresora no se coma la ultima linea.
    const heightMm = Math.ceil(element.offsetHeight * MM_PER_PX) + 2;

    let style = document.getElementById(PAGE_SIZE_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = PAGE_SIZE_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${sale.paperWidthMm}mm ${heightMm}mm; margin: 0; }`;
  }
}
