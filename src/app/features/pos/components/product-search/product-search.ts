import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
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

@Component({
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

  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const products = this.productsStore.products().filter((p) => p.active);
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase() === q
    );
  });

  constructor() {
    this.productsStore.load();
    this.businessSettingsStore.load();
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
      const product = this.productsStore
        .products()
        .find((p) => p.active && p.saleType === 'weight' && p.barcode === weighted.productBarcode);
      if (product) {
        this.query.set('');
        this.notFound.set(false);
        this.posStore.addToCart(product, weighted.weightGrams / GRAMS_PER_KG);
        this.refocus();
        return;
      }
    }

    const match = this.productsStore.products().find((p) => p.active && p.barcode === q);
    this.query.set('');
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

  private refocus(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }
}
