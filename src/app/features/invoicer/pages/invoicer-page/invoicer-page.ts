import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { DOCUMENT_TYPE_OPTIONS } from '../../../customers/data-access/models';
import { EMISOR_CONDICION_IVA_OPTIONS } from '../../../settings/data-access/models';
import { FiscalSettingsStore } from '../../../settings/state/fiscal-settings.store';
import { COMPROBANTE_TIPO_LABEL, IVA_RATE_OPTIONS, IssueInvoiceResult } from '../../data-access/models';
import { StandaloneInvoicesStore } from '../../state/standalone-invoices.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-invoicer-page',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule
  ],
  templateUrl: './invoicer-page.html'
})
export class InvoicerPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(StandaloneInvoicesStore);
  protected readonly fiscalSettingsStore = inject(FiscalSettingsStore);

  protected readonly documentTypeOptions = DOCUMENT_TYPE_OPTIONS;
  protected readonly condicionIvaOptions = EMISOR_CONDICION_IVA_OPTIONS;
  protected readonly ivaRateOptions = IVA_RATE_OPTIONS;
  protected readonly comprobanteTipoLabel = COMPROBANTE_TIPO_LABEL;

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastResult = signal<IssueInvoiceResult | null>(null);
  protected readonly copied = signal(false);

  // El selector de tasa de IVA solo tiene sentido si el negocio es Responsable Inscripto --
  // Monotributo/Exento facturan Factura C, que no discrimina IVA (ver invoice-sale/
  // arca-comprobante.ts, misma regla).
  protected readonly requiresIvaRate = computed(() => this.fiscalSettingsStore.settings()?.emisorCondicionIva === 'RI');

  protected readonly invoicingReady = computed(() => {
    const settings = this.fiscalSettingsStore.settings();
    return !!settings?.electronicInvoicingEnabled && !!settings.afipPuntoVenta && !!settings.emisorCondicionIva;
  });

  protected readonly form = this.fb.nonNullable.group({
    emissionDate: [new Date()],
    consumidorFinal: [true],
    docType: [null as 'DNI' | 'CUIT' | 'CUIL' | null],
    docNumber: [''],
    receptorName: [''],
    receptorCondicionIva: [null as 'RI' | 'M' | 'E' | null],
    montoTotal: [0],
    ivaRate: [null as number | null]
  });

  constructor() {
    this.store.load();
    this.fiscalSettingsStore.load();
  }

  protected async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    this.copied.set(false);
    const raw = this.form.getRawValue();

    if (!raw.montoTotal || raw.montoTotal <= 0) {
      this.errorMessage.set('Ingresá un monto mayor a 0.');
      return;
    }
    if (!raw.consumidorFinal && (!raw.docType || !raw.docNumber || !raw.receptorName || !raw.receptorCondicionIva)) {
      this.errorMessage.set('Completá el documento, nombre y condición IVA del receptor.');
      return;
    }
    if (this.requiresIvaRate() && (raw.ivaRate === null || raw.ivaRate === undefined)) {
      this.errorMessage.set('Elegí la tasa de IVA.');
      return;
    }

    const year = raw.emissionDate.getFullYear();
    const month = String(raw.emissionDate.getMonth() + 1).padStart(2, '0');
    const day = String(raw.emissionDate.getDate()).padStart(2, '0');

    this.saving.set(true);
    try {
      const result = await this.store.issue({
        emissionDate: `${year}-${month}-${day}`,
        consumidorFinal: raw.consumidorFinal,
        docType: raw.consumidorFinal ? null : raw.docType,
        docNumber: raw.consumidorFinal ? null : raw.docNumber || null,
        receptorName: raw.consumidorFinal ? null : raw.receptorName || null,
        receptorCondicionIva: raw.consumidorFinal ? null : raw.receptorCondicionIva,
        montoTotal: raw.montoTotal,
        ivaRate: this.requiresIvaRate() ? raw.ivaRate : null
      });
      this.lastResult.set(result);
      if (!result.ok) {
        this.errorMessage.set(result.error || 'No se pudo facturar.');
      } else {
        this.form.reset({
          emissionDate: new Date(),
          consumidorFinal: true,
          docType: null,
          docNumber: '',
          receptorName: '',
          receptorCondicionIva: null,
          montoTotal: 0,
          ivaRate: null
        });
      }
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo facturar.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onCopy(): Promise<void> {
    const result = this.lastResult();
    if (!result?.cae) return;
    const text = `CAE: ${result.cae}${result.caeDueDate ? ` — Vto: ${result.caeDueDate}` : ''}`;
    await navigator.clipboard.writeText(text);
    this.copied.set(true);
  }
}
