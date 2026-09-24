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

  // Cada pantalla que necesita productos llama a load() en su constructor -- sin este cache
  // por negocio, navegar Vender <-> Productos <-> Categorias iba a Supabase de nuevo por la
  // lista completa cada vez, aunque nada hubiera cambiado. loadedForBusinessId en null (o
  // distinto al negocio activo) fuerza el refetch; loadPromise dedupe llamadas simultaneas
  // (ej. ProductSearch y ProductList montando casi al mismo tiempo).
  private loadedForBusinessId: string | null = null;
  private loadPromise: Promise<void> | null = null;

  async load(force = false): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;
    if (!force && this.loadedForBusinessId === businessId) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      this._loading.set(true);
      try {
        this._products.set(await this.repository.list(businessId));
        this.loadedForBusinessId = businessId;
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async create(input: ProductFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const product = await this.repository.create(businessId, input);
    if (input.isCombo) {
      // La receta vive en otra tabla (product_components) -- mas simple y seguro recargar
      // todo que armar a mano el merge optimista con nombres de componentes resueltos.
      await this.load(true);
    } else {
      this._products.update((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  async update(id: string, input: ProductFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const previousStock = this._products().find((p) => p.id === id)?.stock ?? 0;
    const updated = await this.repository.update(id, businessId, input, previousStock);
    if (input.isCombo) {
      await this.load(true);
    } else {
      this._products.update((list) => list.map((p) => (p.id === id ? updated : p)));
    }
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._products.update((list) => list.map((p) => (p.id === id ? { ...p, active } : p)));
  }

  // Descuento optimista tras confirmar una venta (ver PosStore.confirmSale) -- evita volver a
  // pedir el catalogo entero a Supabase solo para reflejar el stock nuevo, que es justo el
  // momento donde mas importa la velocidad (el cajero ya esta atendiendo al siguiente cliente).
  // Los combos no tienen stock propio (se descuenta de sus componentes reales via
  // stock_movements, ver 20260814181500_combo_products.sql, y este store no tiene la receta
  // cargada) -- se ignoran aca y quedan desactualizados hasta el proximo load() natural.
  applyStockDelta(soldItems: { productId: string; quantity: number }[]): void {
    const sold = new Map(soldItems.map((item) => [item.productId, item.quantity]));
    this._products.update((list) =>
      list.map((p) => {
        const quantity = sold.get(p.id);
        if (!quantity || !p.trackStock || p.isCombo) return p;
        return { ...p, stock: Math.max(0, p.stock - quantity) };
      })
    );
  }

  getComponents(productId: string): Promise<ProductComponent[]> {
    return this.repository.getComponents(productId);
  }

  countExpirationAlerts(): Promise<{ expired: number; expiringSoon: number }> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return Promise.resolve({ expired: 0, expiringSoon: 0 });
    return this.repository.countExpirationAlerts(businessId);
  }
}
