import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { ProductRepository } from '../data-access/product.repository';
import { Product, ProductComponent, ProductFormValue } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class ProductsStore {
  private readonly repository = inject(ProductRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _products = signal<Product[]>([]);
  private readonly _loading = signal(false);

  readonly products = this._products.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._products.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async create(input: ProductFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const product = await this.repository.create(businessId, input);
    if (input.isCombo) {
      // La receta vive en otra tabla (product_components) -- mas simple y seguro recargar
      // todo que armar a mano el merge optimista con nombres de componentes resueltos.
      await this.load();
    } else {
      this._products.update((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  async update(id: string, input: ProductFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.update(id, businessId, input);
    if (input.isCombo) {
      await this.load();
    } else {
      this._products.update((list) =>
        list.map((p) =>
          p.id === id
            ? {
                ...p,
                categoryId: input.categoryId,
                taxId: input.taxId,
                name: input.name,
                barcode: input.barcode,
                saleType: input.saleType,
                price: input.price,
                cost: input.cost,
                trackStock: input.trackStock,
                isCombo: input.isCombo
              }
            : p
        )
      );
    }
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._products.update((list) => list.map((p) => (p.id === id ? { ...p, active } : p)));
  }

  getComponents(productId: string): Promise<ProductComponent[]> {
    return this.repository.getComponents(productId);
  }
}
