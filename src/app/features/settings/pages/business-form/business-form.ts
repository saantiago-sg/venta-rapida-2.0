import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

import { BusinessSettingsStore } from '../../state/business-settings.store';

@Component({
  selector: 'app-business-form',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, InputTextModule],
  templateUrl: './business-form.html'
})
export class BusinessForm {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(BusinessSettingsStore);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    legalName: [''],
    taxId: [''],
    email: ['', Validators.email],
    phone: [''],
    address: [''],
    cashDiscountPercentage: [0, [Validators.min(0), Validators.max(100)]]
  });

  constructor() {
    this.store.load();

    effect(() => {
      const business = this.store.business();
      if (business) {
        this.form.reset({
          name: business.name,
          legalName: business.legalName ?? '',
          taxId: business.taxId ?? '',
          email: business.email ?? '',
          phone: business.phone ?? '',
          address: business.address ?? '',
          cashDiscountPercentage: business.cashDiscountPercentage
        });
      }
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.store.update({
        name: raw.name,
        legalName: raw.legalName || null,
        taxId: raw.taxId || null,
        email: raw.email || null,
        phone: raw.phone || null,
        address: raw.address || null,
        cashDiscountPercentage: raw.cashDiscountPercentage
      });
    } finally {
      this.saving.set(false);
    }
  }
}
