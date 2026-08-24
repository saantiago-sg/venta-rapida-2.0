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

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._settings.set(await this.repository.get(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async save(input: FiscalSettingsFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._settings.set(await this.repository.save(businessId, input));
  }
}
