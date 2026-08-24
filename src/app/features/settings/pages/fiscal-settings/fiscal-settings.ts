import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { FiscalSettingsStore } from '../../state/fiscal-settings.store';

@Component({
  selector: 'app-fiscal-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, ToggleSwitchModule],
  templateUrl: './fiscal-settings.html'
})
export class FiscalSettingsPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(FiscalSettingsStore);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    electronicInvoicingEnabled: [false],
    afipPuntoVenta: [''],
    tusfacturasApitoken: [''],
    tusfacturasApikey: [''],
    tusfacturasUsertoken: [''],
    tusfacturasWebhookToken: ['']
  });

  constructor() {
    this.store.load();

    effect(() => {
      const settings = this.store.settings();
      if (settings) {
        this.form.reset({
          electronicInvoicingEnabled: settings.electronicInvoicingEnabled,
          afipPuntoVenta: settings.afipPuntoVenta ?? '',
          tusfacturasApitoken: settings.tusfacturasApitoken ?? '',
          tusfacturasApikey: settings.tusfacturasApikey ?? '',
          tusfacturasUsertoken: settings.tusfacturasUsertoken ?? '',
          tusfacturasWebhookToken: settings.tusfacturasWebhookToken ?? ''
        });
      }
    });
  }

  protected async onSubmit(): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.store.save({
        electronicInvoicingEnabled: raw.electronicInvoicingEnabled,
        afipPuntoVenta: raw.afipPuntoVenta || null,
        tusfacturasApitoken: raw.tusfacturasApitoken || null,
        tusfacturasApikey: raw.tusfacturasApikey || null,
        tusfacturasUsertoken: raw.tusfacturasUsertoken || null,
        tusfacturasWebhookToken: raw.tusfacturasWebhookToken || null
      });
    } finally {
      this.saving.set(false);
    }
  }
}
