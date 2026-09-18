import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { TabsModule } from 'primeng/tabs';

import { CategoryList } from '../category-list/category-list';
import { ProductList } from '../product-list/product-list';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-products-page',
  imports: [TabsModule, ProductList, CategoryList],
  template: `
    <h1 class="text-xl font-semibold tracking-tight mb-4">Productos</h1>

    <p-tabs value="0" (valueChange)="onTabChange($event)">
      <p-tablist>
        <p-tab value="0">Productos</p-tab>
        <p-tab value="1">Categorías</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="0"><app-product-list /></p-tabpanel>
        <p-tabpanel value="1"><app-category-list /></p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `
})
export class ProductsPage {
  // Ambas pestañas quedan montadas siempre (p-tabs sin [lazy], solo oculta con [hidden] la
  // que no esta activa) -- por eso el foco no se puede resolver en el constructor de cada
  // lista (corre una sola vez) y hay que reforzarlo acá cada vez que cambia la pestaña activa.
  private readonly productList = viewChild(ProductList);
  private readonly categoryList = viewChild(CategoryList);

  protected onTabChange(value: unknown): void {
    if (value === '0') this.productList()?.focusSearch();
    if (value === '1') this.categoryList()?.focusSearch();
  }
}
