import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { AuthStore } from '../../../../core/auth/auth.store';
import { formatLocalDate, parseLocalDate } from '../../../../shared/utils/date';
import { isExpired, isExpiringSoon } from '../../../../shared/utils/expiration';
import { TaxesStore } from '../../../settings/state/taxes.store';
import { ProductImportDialog } from '../../components/product-import-dialog/product-import-dialog';
import { Product } from '../../data-access/models';
import { CategoriesStore } from '../../state/categories.store';
import { ProductsStore } from '../../state/products.store';

const SALE_TYPE_OPTIONS = [
  { label: 'Por unidad', value: 'unit' },
  { label: 'Por peso', value: 'weight' }
];

type ComponentFormGroup = FormGroup<{
  componentProductId: FormControl<string | null>;
  quantity: FormControl<number>;
}>;

// Compara sin importar mayusculas/acentos: "poller" tiene que encontrar "Pollería".
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-product-list',
  imports: [
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    ToggleSwitchModule,
    TooltipModule,
    ProductImportDialog
  ],
  templateUrl: './product-list.html'
})
export class ProductList {
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly importDialogVisible = signal(false);
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  protected readonly productsStore = inject(ProductsStore);
  protected readonly categoriesStore = inject(CategoriesStore);
  protected readonly taxesStore = inject(TaxesStore);

  // Espeja la RLS de la tabla products/categories (categories_manage, products_manage),
  // que exige can_manage_products -- si el boton no se deshabilita aca, el guardado igual
  // falla del lado del servidor con un error crudo de Postgres.
  protected canManageProducts(): boolean {
    return this.authStore.hasPermission('can_manage_products');
  }

  protected readonly saleTypeOptions = SALE_TYPE_OPTIONS;
  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingProduct = signal<Product | null>(null);
  protected readonly componentsError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly searchQuery = signal('');
  protected readonly first = signal(0);
  // '' = todas las categorias, 'none' = sin categoria, sino el id de la categoria.
  protected readonly categoryFilter = signal('');
  protected readonly categoryFilterOptions = computed(() => [
    { label: 'Todas las categorías', value: '' },
    ...this.categoriesStore.categories().map((c) => ({ label: c.name, value: c.id })),
    { label: 'Sin categoría', value: 'none' }
  ]);
  // normalize() (sacar acentos, pasar a minusculas) es la parte cara del filtro -- separarla
  // en un indice aparte hace que solo se recalcule cuando cambia el catalogo, no en cada tecla
  // que se tipea en el buscador. Con catalogos chicos no se nota, pero con miles de productos
  // (ver la importacion masiva desde Excel) recalcularlo por tecla se sentia lento.
  private readonly normalizedIndex = computed(() => {
    const index = new Map<string, { name: string; barcode: string | null }>();
    for (const p of this.productsStore.products()) {
      index.set(p.id, { name: normalize(p.name), barcode: p.barcode ? normalize(p.barcode) : null });
    }
    return index;
  });

  protected readonly filteredProducts = computed(() => {
    const query = normalize(this.searchQuery().trim());
    const category = this.categoryFilter();
    const index = this.normalizedIndex();
    let products = this.productsStore.products();
    if (category === 'none') {
      products = products.filter((p) => !p.categoryId);
    } else if (category) {
      products = products.filter((p) => p.categoryId === category);
    }
    if (!query) return products;
    return products.filter((p) => {
      const normalized = index.get(p.id);
      return !!normalized && (normalized.name.includes(query) || (normalized.barcode?.includes(query) ?? false));
    });
  });

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.first.set(0);
  }

  // El boton nativo se queda con el foco al clickearlo (comportamiento default del navegador)
  // -- hay que devolverlo a mano al input.
  protected onClearSearch(): void {
    this.onSearchChange('');
    this.refocus();
  }

  // El input de busqueda tambien sirve para escanear codigos de barra (mismo criterio que
  // Vender) -- se mantiene el foco ahi salvo cuando el usuario esta activamente escribiendo
  // en el dialog de alta/edicion, y vuelve solo apenas ese dialog se cierra (guardado,
  // cancelado con Escape o click afuera).
  protected onDialogVisibleChange(visible: boolean): void {
    this.dialogVisible.set(visible);
    if (!visible) this.refocus();
  }

  // Llamado desde ProductsPage cuando esta pestaña vuelve a quedar activa (el tab switcher no
  // destruye/recrea este componente, solo lo oculta con [hidden]).
  focusSearch(): void {
    this.refocus();
  }

  private refocus(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  protected onCategoryFilterChange(value: string): void {
    this.categoryFilter.set(value);
    this.first.set(0);
  }

  // Productos elegibles como componente de un combo: activos, que no sean ellos mismos
  // combos (un solo nivel, nada de combos anidados) y sin el producto que se esta editando.
  protected readonly componentOptions = computed(() => {
    const editingId = this.editingProduct()?.id;
    return this.productsStore.products().filter((p) => p.active && !p.isCombo && p.id !== editingId);
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    categoryId: this.fb.control<string | null>(null),
    taxId: this.fb.control<string | null>(null),
    barcode: [''],
    saleType: this.fb.nonNullable.control<'unit' | 'weight'>('unit'),
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [0, [Validators.min(0)]],
    trackStock: [false],
    // Sin Validators.min(0): al editar, "Stock actual" puede venir en negativo si el producto
    // se vendio de mas (la app permite vender a stock negativo, nunca lo bloquea -- ver
    // product-list.html, la columna Stock marca esto en rojo pero no lo prohibe). Si esto
    // fuera invalido, el formulario no dejaria guardar NINGUN cambio en ese producto hasta
    // "corregir" el stock a mano.
    initialStock: [0],
    isCombo: [false],
    expirationDate: this.fb.control<Date | null>(null),
    components: this.fb.array<ComponentFormGroup>([])
  });

  constructor() {
    this.productsStore.load();
    this.categoriesStore.load();
    this.taxesStore.load();
    // El atributo HTML autofocus solo lo respeta el navegador en la carga inicial de la
    // pagina -- al volver a esta ruta navegando dentro de la SPA (el componente se recrea)
    // no siempre se re-aplica solo, hay que forzarlo por codigo.
    this.refocus();
  }

  protected get componentsArray(): FormArray<ComponentFormGroup> {
    return this.form.controls.components;
  }

  protected addComponentRow(): void {
    this.componentsArray.push(this.newComponentGroup());
  }

  protected removeComponentRow(index: number): void {
    this.componentsArray.removeAt(index);
  }

  protected marginPercent(product: Product): number {
    if (product.price <= 0) return 0;
    return ((product.price - product.cost) / product.price) * 100;
  }

  protected isExpired(product: Product): boolean {
    return isExpired(product.expirationDate);
  }

  protected isExpiringSoon(product: Product): boolean {
    return isExpiringSoon(product.expirationDate);
  }

  // Reformatea 'yyyy-mm-dd' a 'dd/mm/yyyy' con un split de texto en vez de DatePipe -- DatePipe
  // interpreta fechas sin hora como UTC y las corre un dia al mostrarlas en UTC-3.
  protected formatExpiration(product: Product): string {
    if (!product.expirationDate) return '';
    const [year, month, day] = product.expirationDate.split('-');
    return `${day}/${month}/${year}`;
  }

  protected showInitialStock(): boolean {
    return !this.form.controls.isCombo.value && this.form.controls.trackStock.value;
  }

  protected openCreate(): void {
    this.editingProduct.set(null);
    this.componentsError.set(null);
    this.errorMessage.set(null);
    this.form.reset({
      name: '',
      categoryId: null,
      taxId: null,
      barcode: '',
      saleType: 'unit',
      price: 0,
      cost: 0,
      trackStock: false,
      initialStock: 0,
      isCombo: false,
      expirationDate: null
    });
    this.clearComponentsArray();
    this.dialogVisible.set(true);
  }

  protected async openEdit(product: Product): Promise<void> {
    this.editingProduct.set(product);
    this.componentsError.set(null);
    this.errorMessage.set(null);
    this.form.reset({
      name: product.name,
      categoryId: product.categoryId,
      taxId: product.taxId,
      barcode: product.barcode ?? '',
      saleType: product.saleType,
      price: product.price,
      cost: product.cost,
      trackStock: product.trackStock,
      initialStock: product.stock,
      isCombo: product.isCombo,
      expirationDate: product.expirationDate ? parseLocalDate(product.expirationDate) : null
    });
    this.clearComponentsArray();
    this.dialogVisible.set(true);

    if (product.isCombo) {
      const components = await this.productsStore.getComponents(product.id);
      for (const component of components) {
        this.componentsArray.push(this.newComponentGroup(component.componentProductId, component.quantity));
      }
    }
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const components = value.components.filter((c) => c.componentProductId);

    if (value.isCombo && components.length === 0) {
      this.componentsError.set('Agregá al menos un componente.');
      return;
    }
    this.componentsError.set(null);
    this.errorMessage.set(null);

    this.saving.set(true);
    try {
      const formValue = {
        categoryId: value.categoryId,
        taxId: value.taxId,
        name: value.name,
        barcode: value.barcode,
        // Un combo no pesa ni tiene stock propio: se fuerza acá para que no dependa de que
        // el usuario haya tocado esos campos antes de tildar "Es un combo".
        saleType: value.isCombo ? ('unit' as const) : value.saleType,
        price: value.price,
        cost: value.cost,
        trackStock: value.isCombo ? false : value.trackStock,
        initialStock: value.initialStock,
        isCombo: value.isCombo,
        expirationDate: value.expirationDate ? formatLocalDate(value.expirationDate) : null,
        components: components.map((c) => ({ componentProductId: c.componentProductId as string, quantity: c.quantity }))
      };

      const editing = this.editingProduct();
      if (editing) {
        await this.productsStore.update(editing.id, formValue);
      } else {
        await this.productsStore.create(formValue);
      }
      this.onDialogVisibleChange(false);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.productsStore.setActive(id, active);
  }

  private newComponentGroup(componentProductId: string | null = null, quantity = 1): ComponentFormGroup {
    return this.fb.group({
      componentProductId: this.fb.control<string | null>(componentProductId, { validators: Validators.required }),
      quantity: this.fb.nonNullable.control(quantity, [Validators.required, Validators.min(0.001)])
    });
  }

  private clearComponentsArray(): void {
    while (this.componentsArray.length) {
      this.componentsArray.removeAt(0);
    }
  }
}
