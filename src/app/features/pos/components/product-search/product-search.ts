import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

import { ProductsStore } from '../../../products/state/products.store';
import { PosStore } from '../../state/pos.store';

@Component({
  selector: 'app-product-search',
  imports: [DecimalPipe, FormsModule, InputTextModule],
  templateUrl: './product-search.html'
})
export class ProductSearch {
  protected readonly productsStore = inject(ProductsStore);
  protected readonly posStore = inject(PosStore);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly query = signal('');
  protected readonly notFound = signal(false);

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
    if (product) {
      this.posStore.addToCart(product);
    }
    this.refocus();
  }

  // Pensado para una pistola lectora: escanea, agrega al carrito, limpia el campo y
  // mantiene el foco ahí mismo para poder seguir escaneando sin tocar el mouse.
  protected onBarcodeEnter(): void {
    const q = this.query().trim();
    if (!q) return;

    const match = this.productsStore.products().find((p) => p.active && p.barcode === q);
    this.query.set('');
    this.notFound.set(!match);

    if (match) {
      this.posStore.addToCart(match);
    }

    this.refocus();
  }

  private refocus(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }
}
