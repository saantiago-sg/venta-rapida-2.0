import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { BusinessSettingsStore } from '../../state/business-settings.store';

function clampDigits(value: string, length: number): string {
  return (value.repeat(length) || '0'.repeat(length)).slice(0, Math.max(length, 0));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scale-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, InputTextModule, ToggleSwitchModule],
  templateUrl: './scale-settings.html'
})
export class ScaleSettingsPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(BusinessSettingsStore);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    enabled: [false],
    prefix: ['20', [Validators.pattern(/^\d*$/)]],
    productCodeDigits: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
    weightDigits: [5, [Validators.required, Validators.min(1), Validators.max(10)]]
  });

  constructor() {
    this.store.load();

    effect(() => {
      const config = this.store.business()?.weightedBarcode;
      if (config) {
        this.form.reset({
          enabled: config.enabled,
          prefix: config.prefix,
          productCodeDigits: config.productCodeDigits,
          weightDigits: config.weightDigits
        });
      }
    });
  }

  // Ejemplo en vivo para que se entienda que hace cada campo sin tener que probarlo con una
  // balanza real -- arma un codigo de muestra y muestra como quedaria separado.
  protected exampleCode(): string {
    const raw = this.form.getRawValue();
    return `${raw.prefix}${clampDigits('1234567890', raw.productCodeDigits)}${clampDigits('0032050', raw.weightDigits)}`;
  }

  protected exampleWeightGrams(): number {
    const raw = this.form.getRawValue();
    return Number(clampDigits('0032050', raw.weightDigits));
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.store.updateWeightedBarcode({
        enabled: raw.enabled,
        prefix: raw.prefix,
        productCodeDigits: raw.productCodeDigits,
        weightDigits: raw.weightDigits
      });
    } finally {
      this.saving.set(false);
    }
  }
}
