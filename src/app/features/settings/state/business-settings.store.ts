import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { BusinessRepository } from '../data-access/business.repository';
import { BusinessSettings, BusinessSettingsFormValue, TicketSettings, WeightedBarcodeConfig } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class BusinessSettingsStore {
  private readonly repository = inject(BusinessRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _business = signal<BusinessSettings | null>(null);
  private readonly _loading = signal(false);

  readonly business = this._business.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._business.set(await this.repository.get(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async update(input: BusinessSettingsFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.update(businessId, input);
    this._business.update((current) => (current ? { ...current, ...input } : current));
  }

  async updateWeightedBarcode(config: WeightedBarcodeConfig): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.updateWeightedBarcode(businessId, config);
    this._business.update((current) => (current ? { ...current, weightedBarcode: config } : current));
  }

  async updateTicketSettings(config: TicketSettings): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.updateTicketSettings(businessId, config);
    this._business.update((current) => (current ? { ...current, ticketSettings: config } : current));
  }

  async completeOnboarding(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.completeOnboarding(businessId);
    this._business.update((current) => (current ? { ...current, onboardingCompleted: true } : current));
  }
}
