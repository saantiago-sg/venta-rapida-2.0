import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { readCache, writeCache } from '../../../core/offline/local-cache';
import { isNetworkError } from '../../../core/offline/network-error';
import { BusinessRepository } from '../data-access/business.repository';
import { BusinessSettings, BusinessSettingsFormValue, TicketSettings, WeightedBarcodeConfig } from '../data-access/models';

const CACHE_KEY = (businessId: string) => `business_settings:${businessId}`;

@Injectable({ providedIn: 'root' })
export class BusinessSettingsStore {
  private readonly repository = inject(BusinessRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _business = signal<BusinessSettings | null>(null);
  private readonly _loading = signal(false);

  readonly business = this._business.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Ver el mismo cache en ProductsStore.load().
  private loadedForBusinessId: string | null = null;
  private loadPromise: Promise<void> | null = null;

  // Stale-while-revalidate, igual que ProductsStore.load(): la copia local se aplica en forma
  // sincronica (antes del primer await), asi quien llama ya tiene business() resuelto apenas
  // vuelve de load() sin esperar la red -- ver onboardingGuard, que es lo que antes frenaba
  // la entrada a la app. Sin conexion y con copia, el error de red no se propaga.
  async load(force = false): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;
    if (!force && this.loadedForBusinessId === businessId) return;
    if (this.loadPromise) return this.loadPromise;

    if (this._business()?.id !== businessId) {
      const cached = readCache<BusinessSettings>(CACHE_KEY(businessId));
      if (cached) this._business.set(cached);
    }

    this.loadPromise = (async () => {
      this._loading.set(this._business()?.id !== businessId);
      try {
        this.setBusiness(await this.repository.get(businessId));
        this.loadedForBusinessId = businessId;
      } catch (err) {
        if (!(isNetworkError(err) && this._business()?.id === businessId)) throw err;
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async update(input: BusinessSettingsFormValue): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.update(businessId, input);
    this.updateBusiness((current) => (current ? { ...current, ...input } : current));
  }

  async updateWeightedBarcode(config: WeightedBarcodeConfig): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.updateWeightedBarcode(businessId, config);
    this.updateBusiness((current) => (current ? { ...current, weightedBarcode: config } : current));
  }

  async updateTicketSettings(config: TicketSettings): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.updateTicketSettings(businessId, config);
    this.updateBusiness((current) => (current ? { ...current, ticketSettings: config } : current));
  }

  async completeOnboarding(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.completeOnboarding(businessId);
    this.updateBusiness((current) => (current ? { ...current, onboardingCompleted: true } : current));
  }

  private setBusiness(business: BusinessSettings): void {
    this._business.set(business);
    writeCache(CACHE_KEY(business.id), business);
  }

  // Toda modificacion local pasa por aca para que la copia no quede atras de la pantalla.
  private updateBusiness(fn: (current: BusinessSettings | null) => BusinessSettings | null): void {
    this._business.update(fn);
    const business = this._business();
    if (business) writeCache(CACHE_KEY(business.id), business);
  }
}
