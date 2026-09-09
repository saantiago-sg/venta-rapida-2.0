import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { BusinessSettingsStore } from '../../../settings/state/business-settings.store';
import { CloseCashSessionResult } from '../../data-access/models';
import { CashSessionStore } from '../../state/cash-session.store';

@Component({
  selector: 'app-cash-register-page',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, ButtonModule, DialogModule, InputNumberModule, TableModule, TagModule],
  templateUrl: './cash-register-page.html'
})
export class CashRegisterPage {
  protected readonly store = inject(CashSessionStore);
  // El nav guard.route solo chequea el permiso -- si el negocio desactivo la caja
  // (Configuracion > Negocio) pero alguien entra igual por URL directa, se muestra un aviso
  // en vez del formulario normal (ver .html).
  protected readonly businessSettingsStore = inject(BusinessSettingsStore);

  protected readonly openingAmount = signal<number | null>(null);
  protected readonly opening = signal(false);
  protected readonly openErrorMessage = signal<string | null>(null);

  protected readonly closeDialogVisible = signal(false);
  protected readonly closingAmount = signal<number | null>(null);
  protected readonly closing = signal(false);
  protected readonly closeErrorMessage = signal<string | null>(null);
  // Se completa recien despues de cerrar -- mientras es null, el dialogo muestra el form;
  // una vez seteado, muestra Esperado/Contado/Diferencia en vez del form (ver .html).
  protected readonly closeResult = signal<CloseCashSessionResult | null>(null);

  constructor() {
    this.businessSettingsStore.load();
    this.store.loadCurrent();
    this.store.loadHistory();
  }

  protected async onOpen(): Promise<void> {
    const amount = this.openingAmount();
    if (amount === null || amount < 0) return;

    this.opening.set(true);
    this.openErrorMessage.set(null);
    try {
      await this.store.open(amount);
      this.openingAmount.set(null);
      await this.store.loadHistory();
    } catch (err) {
      this.openErrorMessage.set(err instanceof Error ? err.message : 'No se pudo abrir la caja.');
    } finally {
      this.opening.set(false);
    }
  }

  protected onCloseClick(): void {
    this.closingAmount.set(null);
    this.closeErrorMessage.set(null);
    this.closeResult.set(null);
    this.closeDialogVisible.set(true);
  }

  protected async onConfirmClose(): Promise<void> {
    const amount = this.closingAmount();
    if (amount === null || amount < 0) return;

    this.closing.set(true);
    this.closeErrorMessage.set(null);
    try {
      this.closeResult.set(await this.store.close(amount));
      await this.store.loadHistory();
    } catch (err) {
      this.closeErrorMessage.set(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
    } finally {
      this.closing.set(false);
    }
  }

  protected onCloseDialogHide(): void {
    this.closeDialogVisible.set(false);
  }
}
