import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { FiscalSettingsRepository } from '../data-access/fiscal-settings.repository';
import { FiscalSettings, FiscalSettingsFormValue } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class FiscalSettingsStore {
  private readonly repository = inject(FiscalSettingsRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _settings = signal<FiscalSettings | null>(null);
  private readonly _loading = signal(false);

  readonly settings = this._settings.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache por negocio activo (ver ProductsStore.load()).
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
        this._settings.set(await this.repository.get(businessId));
        this.loadedForBusinessId = businessId;
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async save(input: FiscalSettingsFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._settings.set(await this.repository.save(businessId, input));
  }
}
