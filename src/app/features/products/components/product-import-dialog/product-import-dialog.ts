import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { Category } from '../../data-access/models';
import {
  ProductImportPreviewRow,
  buildProductImportPreview,
  buildProductImportTemplate,
  parseProductImportFile
} from '../../data-access/product-import';
import { CategoriesStore } from '../../state/categories.store';
import { ProductsStore } from '../../state/products.store';
import { TaxesStore } from '../../../settings/state/taxes.store';

type ImportStep = 'upload' | 'preview' | 'result';

interface ImportRowResult {
  rowNumber: number;
  name: string;
  outcome: 'created' | 'updated' | 'error';
  errorMessage: string | null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-product-import-dialog',
  imports: [DecimalPipe, ButtonModule, DialogModule, ProgressBarModule, TableModule, TagModule],
  templateUrl: './product-import-dialog.html'
})
export class ProductImportDialog {
  private readonly productsStore = inject(ProductsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly taxesStore = inject(TaxesStore);

  readonly visible = input(false);
  readonly visibleChange = output<boolean>();

  protected readonly step = signal<ImportStep>('upload');
  protected readonly parsing = signal(false);
  protected readonly parseErrorMessage = signal<string | null>(null);
  protected readonly previewRows = signal<ProductImportPreviewRow[]>([]);

  protected readonly committing = signal(false);
  protected readonly commitProgress = signal(0);
  protected readonly results = signal<ImportRowResult[]>([]);

  protected readonly validRowCount = computed(() => this.previewRows().filter((r) => r.action !== 'error').length);
  protected readonly createCount = computed(() => this.previewRows().filter((r) => r.action === 'create').length);
  protected readonly updateCount = computed(() => this.previewRows().filter((r) => r.action === 'update').length);
  protected readonly errorCount = computed(() => this.previewRows().filter((r) => r.action === 'error').length);

  protected readonly createdCount = computed(() => this.results().filter((r) => r.outcome === 'created').length);
  protected readonly updatedCount = computed(() => this.results().filter((r) => r.outcome === 'updated').length);
  protected readonly failedResults = computed(() => this.results().filter((r) => r.outcome === 'error'));

  protected onHide(): void {
    this.visibleChange.emit(false);
    // Se resetea al cerrar, no al abrir -- asi si el usuario reabre por error justo despues
    // de cerrar, no ve un parpadeo del estado inicial antes de que vuelva a montar.
    this.step.set('upload');
    this.parseErrorMessage.set(null);
    this.previewRows.set([]);
    this.results.set([]);
    this.commitProgress.set(0);
  }

  protected async onDownloadTemplate(): Promise<void> {
    const blob = await buildProductImportTemplate();
    triggerDownload(blob, 'plantilla_productos.xlsx');
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.parsing.set(true);
    this.parseErrorMessage.set(null);
    try {
      const rawRows = await parseProductImportFile(file);
      if (rawRows.length === 0) {
        this.parseErrorMessage.set('El archivo no tiene filas para importar.');
        return;
      }
      this.previewRows.set(
        buildProductImportPreview(rawRows, this.productsStore.products(), this.categoriesStore.categories(), this.taxesStore.taxes())
      );
      this.step.set('preview');
    } catch (err) {
      this.parseErrorMessage.set(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      this.parsing.set(false);
      (event.target as HTMLInputElement).value = '';
    }
  }

  protected onBackToUpload(): void {
    this.step.set('upload');
    this.previewRows.set([]);
  }

  // Categorias nuevas: se crean una sola vez por nombre (varias filas pueden pedir la misma
  // categoria), reusando el id para el resto de las filas de este mismo import.
  private async resolveCategoryId(row: ProductImportPreviewRow, createdCategories: Map<string, string>): Promise<string | null> {
    if (!row.categoryIsNew) return row.categoryId;

    const key = row.categoryName!.trim().toLowerCase();
    const cached = createdCategories.get(key);
    if (cached) return cached;

    await this.categoriesStore.create(row.categoryName!.trim());
    const created = this.categoriesStore.categories().find((c: Category) => c.name.trim().toLowerCase() === key);
    if (!created) throw new Error(`No se pudo crear la categoría "${row.categoryName}"`);
    createdCategories.set(key, created.id);
    return created.id;
  }

  protected async onConfirmImport(): Promise<void> {
    const rows = this.previewRows().filter((r) => r.action !== 'error');
    const createdCategories = new Map<string, string>();
    const rowResults: ImportRowResult[] = [];

    this.committing.set(true);
    this.commitProgress.set(0);

    // Fila por fila, secuencial: si una falla no bloquea a las demas, y evita mandar de golpe
    // decenas/cientos de requests en paralelo contra Supabase.
    for (const row of rows) {
      try {
        const categoryId = await this.resolveCategoryId(row, createdCategories);

        if (row.action === 'create') {
          await this.productsStore.create({
            categoryId,
            taxId: row.taxId,
            name: row.name,
            barcode: row.barcode,
            saleType: row.saleType,
            price: row.price,
            cost: row.cost,
            trackStock: row.trackStock,
            initialStock: row.initialStock,
            isCombo: false,
            components: []
          });
          rowResults.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'created', errorMessage: null });
        } else {
          // Update: nunca se toca trackStock/stock via import (se preservan tal cual estan)
          // -- una planilla vieja no debe poder resetear el stock real de un producto.
          const existing = this.productsStore.products().find((p) => p.id === row.matchedProductId);
          if (!existing) throw new Error('El producto ya no existe (¿se borró mientras se armaba el import?)');

          await this.productsStore.update(row.matchedProductId!, {
            categoryId,
            taxId: row.taxId,
            name: row.name,
            barcode: row.barcode,
            saleType: row.saleType,
            price: row.price,
            cost: row.cost,
            trackStock: existing.trackStock,
            initialStock: existing.stock,
            isCombo: false,
            components: []
          });
          rowResults.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'updated', errorMessage: null });
        }
      } catch (err) {
        rowResults.push({
          rowNumber: row.rowNumber,
          name: row.name,
          outcome: 'error',
          errorMessage: err instanceof Error ? err.message : 'No se pudo guardar esta fila.'
        });
      } finally {
        this.commitProgress.update((n) => n + 1);
      }
    }

    this.results.set(rowResults);
    this.committing.set(false);
    this.step.set('result');
  }

  protected onFinish(): void {
    this.onHide();
  }
}
