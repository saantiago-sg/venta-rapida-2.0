import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { ArcaEnvironment, EMISOR_CONDICION_IVA_OPTIONS, EmisorCondicionIva } from '../../data-access/models';
import { FiscalSettingsStore } from '../../state/fiscal-settings.store';

const ARCA_ENVIRONMENT_OPTIONS: { label: string; value: ArcaEnvironment }[] = [
  { label: 'Homologación (pruebas)', value: 'homologacion' },
  { label: 'Producción', value: 'produccion' }
];

@Component({
  selector: 'app-fiscal-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, ToggleSwitchModule],
  templateUrl: './fiscal-settings.html'
})
export class FiscalSettingsPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(FiscalSettingsStore);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly environmentOptions = ARCA_ENVIRONMENT_OPTIONS;
  protected readonly condicionIvaOptions = EMISOR_CONDICION_IVA_OPTIONS;

  // Contenido de los archivos elegidos, pendiente de guardar -- separado del FormGroup porque
  // no son controles de formulario tradicionales (se leen con FileReader, no se tipean). Se
  // limpian despues de cada guardado exitoso; si quedan null, el certificado ya guardado no se
  // toca (ver FiscalSettingsRepository.save).
  protected readonly pendingCertName = signal<string | null>(null);
  protected readonly pendingKeyName = signal<string | null>(null);
  private pendingCert: string | null = null;
  private pendingKey: string | null = null;

  protected readonly form = this.fb.nonNullable.group({
    electronicInvoicingEnabled: [false],
    arcaEnvironment: ['homologacion' as ArcaEnvironment],
    afipPuntoVenta: [''],
    emisorCondicionIva: [null as EmisorCondicionIva | null]
  });

  constructor() {
    this.store.load();

    effect(() => {
      const settings = this.store.settings();
      if (settings) {
        this.form.reset({
          electronicInvoicingEnabled: settings.electronicInvoicingEnabled,
          arcaEnvironment: settings.arcaEnvironment,
          afipPuntoVenta: settings.afipPuntoVenta ?? '',
          emisorCondicionIva: settings.emisorCondicionIva
        });
      }
    });
  }

  protected async onCertFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingCert = await file.text();
    this.pendingCertName.set(file.name);
  }

  protected async onKeyFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingKey = await file.text();
    this.pendingKeyName.set(file.name);
  }

  protected async onSubmit(): Promise<void> {
    if ((this.pendingCert && !this.pendingKey) || (!this.pendingCert && this.pendingKey)) {
      this.errorMessage.set('El certificado y la clave privada se cargan juntos.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const raw = this.form.getRawValue();
      await this.store.save({
        electronicInvoicingEnabled: raw.electronicInvoicingEnabled,
        arcaEnvironment: raw.arcaEnvironment,
        afipPuntoVenta: raw.afipPuntoVenta || null,
        emisorCondicionIva: raw.emisorCondicionIva,
        ...(this.pendingCert && this.pendingKey ? { cert: this.pendingCert, privateKey: this.pendingKey } : {})
      });
      this.pendingCert = null;
      this.pendingKey = null;
      this.pendingCertName.set(null);
      this.pendingKeyName.set(null);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      this.saving.set(false);
    }
  }
}
