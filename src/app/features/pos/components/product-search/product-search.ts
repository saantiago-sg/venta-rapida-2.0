import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

import { Product } from '../../../products/data-access/models';
import { ProductsStore } from '../../../products/state/products.store';
import { DEFAULT_WEIGHTED_BARCODE_CONFIG } from '../../../settings/data-access/models';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { PosStore } from '../../state/pos.store';
import { parseWeightedBarcode } from '../../data-access/weighted-barcode';

const GRAMS_PER_KG = 1000;
const RESULTS_PAGE_SIZE = 60;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-product-search',
  imports: [DecimalPipe, UpperCasePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule],
  templateUrl: './product-search.html'
})
export class ProductSearch {
  protected readonly productsStore = inject(ProductsStore);
  protected readonly posStore = inject(PosStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly query = signal('');
  protected readonly notFound = signal(false);
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  // Los productos por peso no se agregan directo: primero se pide el peso en un popup,
  // asi la linea del carrito ya nace con el kilaje correcto en vez de arrancar en "1 kg"
  // y tener que corregirla despues a mano. Se pide en gramos enteros (lo que tipea el
  // cajero directo de la balanza), no en kilos con coma -- mismo criterio que el carrito.
  protected readonly weighingProduct = signal<Product | null>(null);
  protected readonly weightInput = signal<number | null>(GRAMS_PER_KG);

  // Traduccion en texto plano del peso a kg + g -- al cajero le cuesta menos leer "2 kg y
  // 100 g" que calcular de cabeza cuanto son 2100 gramos.
  protected readonly weightHint = computed(() => {
    const grams = this.weightInput();
    if (!grams || grams <= 0) return null;

    const kg = Math.floor(grams / GRAMS_PER_KG);
    const remainder = grams % GRAMS_PER_KG;
    if (kg === 0) return `${remainder} g`;
    if (remainder === 0) return `${kg} kg`;
    return `${kg} kg y ${remainder} g`;
  });

  // Todo lo que depende solo del catalogo (no de lo tipeado) se arma una vez por cambio de
  // catalogo y no en cada tecla: los nombres en minuscula para filtrar, y un indice por codigo
  // de barras para que el escaneo sea un lookup directo en vez de recorrer la lista entera.
  private readonly searchIndex = computed(() =>
    this.productsStore
      .products()
      .filter((p) => p.active)
      .map((product) => ({ product, name: product.name.toLowerCase(), barcode: product.barcode?.toLowerCase() ?? null }))
  );
  private readonly byBarcode = computed(() => {
    const index = new Map<string, Product>();
    for (const { product } of this.searchIndex()) {
      // Con codigos repetidos gana el primero en orden alfabetico, igual que el find() de antes.
      if (product.barcode && !index.has(product.barcode)) index.set(product.barcode, product);
    }
    return index;
  });

  // La grilla dibuja como mucho resultLimit() tarjetas: con el catalogo entero (miles de
  // productos, cada uno con su animacion de entrada) cada tecla redibujaba todo y tipear se
  // trababa. Los demas quedan a un "Ver mas" de distancia, y buscar siempre los encuentra.
  protected readonly resultLimit = signal(RESULTS_PAGE_SIZE);

  private readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const index = this.searchIndex();
    if (!q) return index;
    return index.filter((entry) => entry.name.includes(q) || entry.barcode === q);
  });
  protected readonly totalResults = computed(() => this.matches().length);
  protected readonly results = computed(() =>
    this.matches()
      .slice(0, this.resultLimit())
      .map((entry) => entry.product)
  );

  constructor() {
    this.productsStore.load();
    this.businessSettingsStore.load();
    // El atributo HTML autofocus solo lo respeta el navegador en la carga inicial de la
    // pagina -- al volver a esta ruta navegando dentro de la SPA (el componente se recrea)
    // no siempre se re-aplica solo, hay que forzarlo por codigo.
    this.refocus();
  }

  // Ademas de (keyup.enter), se cubre el caso de una pistola lectora que por config o un hipo
  // puntual no manda el Enter final: si a los 150ms de la ultima tecla nadie tipeo mas y lo que
  // quedo matchea un codigo de barras exacto (no un nombre parcial), se busca solo. El guard de
  // "matchea exacto" evita que esto se dispare mientras el cajero tipea a mano el nombre de un
  // producto y hace una pausa larga -- onBarcodeEnter() limpia el campo en cada intento, y eso
  // rompería la busqueda en vivo por nombre si se disparara con cualquier pausa.
  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.notFound.set(false);
    this.resultLimit.set(RESULTS_PAGE_SIZE);

    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    const trimmed = value.trim();
    if (!trimmed) return;

    this.scanTimeout = setTimeout(() => {
      if (this.query().trim() === trimmed && this.hasExactBarcodeMatch(trimmed)) this.onBarcodeEnter();
    }, 150);
  }

  private hasExactBarcodeMatch(q: string): boolean {
    const weighted = parseWeightedBarcode(
      q,
      this.businessSettingsStore.business()?.weightedBarcode ?? DEFAULT_WEIGHTED_BARCODE_CONFIG
    );
    if (weighted) return this.byBarcode().get(weighted.productBarcode)?.saleType === 'weight';
    return this.byBarcode().has(q);
  }

  protected onSelect(productId: string): void {
    const product = this.productsStore.products().find((p) => p.id === productId);
    if (!product) {
      this.refocus();
      return;
    }
    if (product.saleType === 'weight') {
      this.openWeighDialog(product);
      return;
    }
    this.posStore.addToCart(product);
    this.refocus();
  }

  // Pensado para una pistola lectora: escanea, agrega al carrito, limpia el campo y
  // mantiene el foco ahí mismo para poder seguir escaneando sin tocar el mouse. Si el
  // producto es por peso, el foco pasa al popup de peso en vez de volver acá.
  protected onBarcodeEnter(): void {
    const q = this.query().trim();
    if (!q) return;

    // Si la balanza imprime el peso codificado en el codigo (config por negocio), se prueba
    // primero ese patron -- matchea, agrega directo con el peso ya pesado y listo, sin pasar
    // por el popup manual. Si no matchea o no encuentra el producto, cae al lookup de siempre.
    const weighted = parseWeightedBarcode(
      q,
      this.businessSettingsStore.business()?.weightedBarcode ?? DEFAULT_WEIGHTED_BARCODE_CONFIG
    );
    if (weighted) {
      const product = this.byBarcode().get(weighted.productBarcode);
      if (product?.saleType === 'weight') {
        this.clearQuery();
        this.notFound.set(false);
        this.posStore.addToCart(product, weighted.weightGrams / GRAMS_PER_KG);
        this.refocus();
        return;
      }
    }

    const match = this.byBarcode().get(q);
    this.clearQuery();
    this.notFound.set(!match);

    if (!match) {
      this.refocus();
      return;
    }
    if (match.saleType === 'weight') {
      this.openWeighDialog(match);
      return;
    }
    this.posStore.addToCart(match);
    this.refocus();
  }

  // Con el sufijo " g", PrimeNG bloquea el backspace cuando el cursor cae al final del
  // texto (justo despues del sufijo) -- seleccionar todo al enfocar evita ese bloqueo:
  // cualquier tecla (borrar o tipear) reemplaza el valor completo de una.
  protected onWeightFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected onCancelWeight(): void {
    this.weighingProduct.set(null);
    this.refocus();
  }

  protected onConfirmWeight(): void {
    const product = this.weighingProduct();
    const grams = this.weightInput();
    if (!product || !grams || grams <= 0) return;

    this.posStore.addToCart(product, grams / GRAMS_PER_KG);
    this.weighingProduct.set(null);
    this.refocus();
  }

  private openWeighDialog(product: Product): void {
    this.weighingProduct.set(product);
    this.weightInput.set(GRAMS_PER_KG);
  }

  protected onShowMore(): void {
    this.resultLimit.update((limit) => limit + RESULTS_PAGE_SIZE);
  }

  // El boton nativo se queda con el foco al clickearlo (comportamiento default del navegador)
  // -- hay que devolverlo a mano al input.
  protected onClearSearch(): void {
    this.clearQuery();
    this.notFound.set(false);
    this.resultLimit.set(RESULTS_PAGE_SIZE);
    this.refocus();
  }

  // Llamado desde PosPage al cerrar el dialogo de "Venta confirmada" -- ese dialog atrapa el
  // foco mientras esta abierto, y al cerrarse el navegador lo manda a <body> si no se lo
  // devuelve a mano.
  focusSearch(): void {
    this.refocus();
  }

  // Sin zone.js, Angular junta los cambios y redibuja una vez por cuadro. Una pistola tipea los
  // 13 digitos + Enter en pocos milisegundos, asi que query pasa de '' a '7790...' y de vuelta a
  // '' (al agregar el producto) antes del proximo redibujo: el [ngModel] ve '' -> '' y no toca el
  // input, el codigo escaneado queda escrito y el siguiente escaneo se pega a continuacion ("no
  // se encontro"). Por eso, ademas del signal, se limpia el input a mano.
  private clearQuery(): void {
    this.query.set('');
    const input = this.searchInput()?.nativeElement;
    if (input) input.value = '';
  }

  private refocus(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }
}
