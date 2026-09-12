import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CategoriesStore } from '../../state/categories.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-category-list',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, TableModule, ToggleSwitchModule, TooltipModule],
  templateUrl: './category-list.html'
})
export class CategoryList {
  protected readonly store = inject(CategoriesStore);
  private readonly authStore = inject(AuthStore);

  // Espeja la RLS de categories_manage (exige can_manage_products) -- sin esto el guardado
  // igual falla del lado del servidor con un error crudo de Postgres.
  protected canManageProducts(): boolean {
    return this.authStore.hasPermission('can_manage_products');
  }

  protected readonly searchQuery = signal('');
  protected readonly dialogVisible = signal(false);
  protected readonly newCategoryName = signal('');
  protected readonly saving = signal(false);

  protected readonly filteredCategories = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.store.categories();
    return this.store.categories().filter((c) => c.name.toLowerCase().includes(q));
  });

  constructor() {
    this.store.load();
  }

  protected openCreate(): void {
    this.newCategoryName.set('');
    this.dialogVisible.set(true);
  }

  protected async onCreate(): Promise<void> {
    const name = this.newCategoryName().trim();
    if (!name) return;

    this.saving.set(true);
    try {
      await this.store.create(name);
      this.dialogVisible.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }
}
