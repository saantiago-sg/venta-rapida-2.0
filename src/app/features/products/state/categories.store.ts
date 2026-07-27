import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { CategoryRepository } from '../data-access/category.repository';
import { Category } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly repository = inject(CategoryRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _categories = signal<Category[]>([]);
  private readonly _loading = signal(false);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly activeCategories = computed(() => this._categories().filter((c) => c.active));

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._categories.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async create(name: string): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const category = await this.repository.create(businessId, name);
    this._categories.update((list) => [...list, category].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repository.setActive(id, active);
    this._categories.update((list) => list.map((c) => (c.id === id ? { ...c, active } : c)));
  }
}
