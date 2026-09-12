import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { AuthStore } from '../../../../core/auth/auth.store';
import { PaymentMethodsStore } from '../../../settings/state/payment-methods.store';
import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { ProductsStore } from '../../../products/state/products.store';

const SALE_TYPE_OPTIONS = [
  { label: 'Por unidad', value: 'unit' as const },
  { label: 'Por peso', value: 'weight' as const }
];

type Step = 1 | 2 | 3 | 4;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-onboarding-page',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule
  ],
  templateUrl: './onboarding-page.html'
})
export class OnboardingPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly businessSettingsStore = inject(BusinessSettingsStore);
  private readonly productsStore = inject(ProductsStore);
  protected readonly paymentMethodsStore = inject(PaymentMethodsStore);
  private readonly router = inject(Router);

  protected readonly step = signal<Step>(1);
  protected readonly businessName = this.authStore.activeMembership()?.businessName ?? 'tu negocio';
  protected readonly saleTypeOptions = SALE_TYPE_OPTIONS;

  protected readonly productForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0.01)]],
    saleType: ['unit' as 'unit' | 'weight']
  });

  protected readonly addedCount = signal(0);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected goTo(step: Step): void {
    this.step.set(step);
    if (step === 3) this.paymentMethodsStore.load();
  }

  protected onTogglePaymentMethod(id: string, active: boolean): void {
    this.paymentMethodsStore.setActive(id, active);
  }

  protected async onAddProduct(): Promise<void> {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const { name, price, saleType } = this.productForm.getRawValue();
      await this.productsStore.create({
        categoryId: null,
        taxId: null,
        name,
        barcode: null,
        saleType,
        price,
        cost: 0,
        trackStock: false,
        initialStock: 0,
        isCombo: false,
        components: []
      });
      this.addedCount.update((count) => count + 1);
      this.productForm.reset({ name: '', price: 0, saleType: 'unit' });
    } catch (err) {
      console.error('No se pudo cargar el producto', err);
      this.errorMessage.set('No se pudo cargar el producto. Probá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onSkipAll(): Promise<void> {
    await this.businessSettingsStore.completeOnboarding();
    await this.router.navigateByUrl('/dashboard');
  }

  protected async onFinish(): Promise<void> {
    await this.businessSettingsStore.completeOnboarding();
    await this.router.navigateByUrl('/pos');
  }
}
