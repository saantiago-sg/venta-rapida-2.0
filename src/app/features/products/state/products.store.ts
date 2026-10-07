import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { isNetworkError } from '../../../core/offline/network-error';
import { readProductCache, writeProductCache } from '../data-access/product-cache';
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
  // De que negocio es el catalogo que esta hoy en _products (venga de la red o del cache
  // local) -- distinto de loadedForBusinessId, que solo se marca con una respuesta de la red.
  private productsBusinessId: string | null = null;

  // Stale-while-revalidate: si hay copia local del catalogo (ver product-cache.ts) se muestra
  // al instante, sin spinner, y la red la reemplaza apenas responde. Antes cada apertura de la
  // app esperaba el catalogo entero de Supabase antes de poder vender. Sin conexion, la copia
  // local queda en pantalla y el proximo load() reintenta contra el servidor.
  async load(force = false): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;
    if (!force && this.loadedForBusinessId === businessId) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      if (this.productsBusinessId !== businessId) {
        const cached = await readProductCache(businessId);
        if (cached) this.setProducts(businessId, cached, { persist: false });
      }
      this._loading.set(this.productsBusinessId !== businessId);
      try {
        this.setProducts(businessId, await this.repository.list(businessId));
        this.loadedForBusinessId = businessId;
      } catch (err) {
        if (!(isNetworkError(err) && this.productsBusinessId === businessId)) throw err;
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
      this.updateProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name)));
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
      this.updateProducts((list) => list.map((p) => (p.id === id ? updated : p)));
    }
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
    this.updateProducts((list) => list.filter((p) => p.id !== id));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this.updateProducts((list) => list.map((p) => (p.id === id ? { ...p, active } : p)));
  }

  // Descuento optimista tras confirmar una venta (ver PosStore.confirmSale) -- evita volver a
  // pedir el catalogo entero a Supabase solo para reflejar el stock nuevo, que es justo el
  // momento donde mas importa la velocidad (el cajero ya esta atendiendo al siguiente cliente).
  // Los combos no tienen stock propio (se descuenta de sus componentes reales via
  // stock_movements, ver 20260814181500_combo_products.sql, y este store no tiene la receta
  // cargada) -- se ignoran aca y quedan desactualizados hasta el proximo load() natural.
  applyStockDelta(soldItems: { productId: string; quantity: number }[]): void {
    const sold = new Map(soldItems.map((item) => [item.productId, item.quantity]));
    this.updateProducts((list) =>
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

  private setProducts(businessId: string, products: Product[], { persist = true } = {}): void {
    this._products.set(products);
    this.productsBusinessId = businessId;
    if (persist) void writeProductCache(businessId, products);
  }

  // Toda modificacion local (alta, edicion, descuento de stock post-venta) pasa por aca para
  // que la copia local no quede atras de lo que se ve en pantalla -- ver load().
  private updateProducts(fn: (list: Product[]) => Product[]): void {
    this._products.update(fn);
    if (this.productsBusinessId) void writeProductCache(this.productsBusinessId, this._products());
  }
}
