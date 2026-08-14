import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

import { Product } from '../../../products/data-access/models';
import { ProductsStore } from '../../../products/state/products.store';
import { PosStore } from '../../state/pos.store';

const GRAMS_PER_KG = 1000;

@Component({
  selector: 'app-product-search',
  imports: [DecimalPipe, UpperCasePipe, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule],
  templateUrl: './product-search.html'
})
export class ProductSearch {
  protected readonly productsStore = inject(ProductsStore);
  protected readonly posStore = inject(PosStore);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly query = signal('');
  protected readonly notFound = signal(false);

  // Los productos por peso no se agregan directo: primero se pide el peso en un popup,
  // asi la linea del carrito ya nace con el kilaje correcto en vez de arrancar en "1 kg"
  // y tener que corregirla despues a mano. Se pide en gramos enteros (lo que tipea el
  // cajero directo de la balanza), no en kilos con coma -- mismo criterio que el carrito.
  protected readonly weighingProduct = signal<Product | null>(null);
  protected readonly weightInput = signal<number | null>(GRAMS_PER_KG);

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
