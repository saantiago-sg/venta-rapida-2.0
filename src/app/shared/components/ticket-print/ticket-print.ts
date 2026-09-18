import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
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

// Se queda siempre montado y en display:block, oculto con visibility (no display:none -- ver
// comentario en el constructor) y fuera de pantalla con position:fixed. window.print() imprime
// la pagina completa, asi que el aislamiento de "imprimir solo esto" lo hace la regla global en
// styles.css (".ticket-print-root"), no este componente.
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
    // 'beforeprint' NO garantiza que el navegador ya haya aplicado los estilos de @media
    // print en ese preciso instante -- si .ticket-print-root dependiera de display:none/block
    // por media query (como tenia antes via las clases de Tailwind "hidden print:block"),
    // ese offsetHeight podia leerse en 0 y calcular una pagina de ~2mm, partiendo el ticket en
    // un monton de paginas microscopicas (y como el elemento es position:fixed, se repetia
    // en cada una). Por eso el elemento se mantiene siempre display:block (solo oculto con
    // visibility, ver ticket-print.html/styles.css) -- asi offsetHeight es confiable sin
    // importar el timing exacto de este evento.
    const handler = () => this.applyPageSize();
    window.addEventListener('beforeprint', handler);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeprint', handler));
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
