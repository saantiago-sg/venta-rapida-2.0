import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { TicketPaperWidthMm } from '../../data-access/models';
import { BusinessSettingsStore } from '../../state/business-settings.store';

@Component({
  selector: 'app-ticket-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, ToggleSwitchModule],
  templateUrl: './ticket-settings.html'
})
export class TicketSettingsPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(BusinessSettingsStore);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    autoPrintEnabled: [false],
    paperWidthMm: [80 as TicketPaperWidthMm],
    headerText: [''],
    footerText: ['']
  });

  constructor() {
    this.store.load();

    effect(() => {
      const settings = this.store.business()?.ticketSettings;
      if (settings) {
        this.form.reset({
          autoPrintEnabled: settings.autoPrintEnabled,
          paperWidthMm: settings.paperWidthMm,
          headerText: settings.headerText ?? '',
          footerText: settings.footerText ?? ''
        });
      }
    });
  }

  protected setPaperWidth(width: TicketPaperWidthMm): void {
    this.form.controls.paperWidthMm.setValue(width);
  }

  protected async onSubmit(): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.store.updateTicketSettings({
        autoPrintEnabled: raw.autoPrintEnabled,
        paperWidthMm: raw.paperWidthMm,
        headerText: raw.headerText.trim() || null,
        footerText: raw.footerText.trim() || null
      });
    } finally {
      this.saving.set(false);
    }
  }
}
