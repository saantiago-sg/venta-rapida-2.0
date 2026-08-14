import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { TaxesStore } from '../../../settings/state/taxes.store';
import { Product } from '../../data-access/models';
import { CategoriesStore } from '../../state/categories.store';
import { ProductsStore } from '../../state/products.store';

const SALE_TYPE_OPTIONS = [
  { label: 'Por unidad', value: 'unit' },
  { label: 'Por peso', value: 'weight' }
];

// Compara sin importar mayusculas/acentos: "poller" tiene que encontrar "Pollería".
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

@Component({
  selector: 'app-product-list',
  imports: [
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    ToggleSwitchModule
  ],
  templateUrl: './product-list.html'
})
export class ProductList {
  private readonly fb = inject(FormBuilder);
  protected readonly productsStore = inject(ProductsStore);
  protected readonly categoriesStore = inject(CategoriesStore);
  protected readonly taxesStore = inject(TaxesStore);

  protected readonly saleTypeOptions = SALE_TYPE_OPTIONS;
  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingProduct = signal<Product | null>(null);

  protected readonly searchQuery = signal('');
  protected readonly filteredProducts = computed(() => {
    const query = normalize(this.searchQuery().trim());
    const products = this.productsStore.products();
    if (!query) return products;
    return products.filter(
      (p) => normalize(p.name).includes(query) || (p.barcode && normalize(p.barcode).includes(query))
    );
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    categoryId: this.fb.control<string | null>(null),
    taxId: this.fb.control<string | null>(null),
    barcode: [''],
    saleType: this.fb.nonNullable.control<'unit' | 'weight'>('unit'),
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [0, [Validators.min(0)]],
    trackStock: [true],
    initialStock: [0, [Validators.min(0)]]
  });

  constructor() {
    this.productsStore.load();
    this.categoriesStore.load();
    this.taxesStore.load();
  }

  protected openCreate(): void {
    this.editingProduct.set(null);
    this.form.reset({
      name: '',
      categoryId: null,
      taxId: null,
      barcode: '',
      saleType: 'unit',
      price: 0,
      cost: 0,
      trackStock: true,
      initialStock: 0
    });
    this.dialogVisible.set(true);
  }

  protected openEdit(product: Product): void {
    this.editingProduct.set(product);
    this.form.reset({
      name: product.name,
      categoryId: product.categoryId,
      taxId: product.taxId,
      barcode: product.barcode ?? '',
      saleType: product.saleType,
      price: product.price,
      cost: product.cost,
      trackStock: product.trackStock,
      initialStock: 0
    });
    this.dialogVisible.set(true);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const editing = this.editingProduct();
      if (editing) {
        await this.productsStore.update(editing.id, value);
      } else {
        await this.productsStore.create(value);
      }
      this.dialogVisible.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.productsStore.setActive(id, active);
  }
}
