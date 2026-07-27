import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { CategoriesStore } from '../../state/categories.store';

@Component({
  selector: 'app-category-list',
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, ToggleSwitchModule],
  templateUrl: './category-list.html'
})
export class CategoryList {
  protected readonly store = inject(CategoriesStore);
  protected readonly newCategoryName = signal('');
  protected readonly saving = signal(false);

  constructor() {
    this.store.load();
  }

  protected async onCreate(): Promise<void> {
    const name = this.newCategoryName().trim();
    if (!name) return;

    this.saving.set(true);
    try {
      await this.store.create(name);
      this.newCategoryName.set('');
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }
}
