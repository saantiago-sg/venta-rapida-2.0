import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { PaymentMethod } from '../../data-access/models';
import { PaymentMethodsStore } from '../../state/payment-methods.store';

// Los errores de Supabase (PostgrestError) son objetos planos con .message, no instancias
// de Error -- si solo se chequea "instanceof Error" el motivo real (RLS, FK, columna
// invalida, etc.) queda oculto detras de un mensaje generico.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}

@Component({
  selector: 'app-payment-method-list',
  imports: [FormsModule, ButtonModule, ConfirmDialogModule, InputTextModule, TableModule, TagModule, ToggleSwitchModule],
  providers: [ConfirmationService],
  templateUrl: './payment-method-list.html'
})
export class PaymentMethodList {
  protected readonly store = inject(PaymentMethodsStore);
  private readonly confirmationService = inject(ConfirmationService);

  // p-table por defecto trackea filas por identidad de objeto -- como cada toggle reemplaza
  // la fila entera por un objeto nuevo (para no mutar el signal), sin esto Angular destruye y
  // recrea toda la fila en cada cambio, haciendo que el switch que NO se toco parpadee tambien.
  protected readonly trackById = (_: number, method: PaymentMethod): string => method.id;

  protected readonly newName = signal('');
  protected readonly newIsCash = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  constructor() {
    this.store.load();
  }

  protected async onCreate(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await this.store.create(name, this.newIsCash());
      this.newName.set('');
      this.newIsCash.set(false);
    } catch (err) {
      console.error('No se pudo crear el medio de pago', err);
      this.errorMessage.set(extractErrorMessage(err, 'No se pudo crear el medio de pago.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }

  protected onDeleteClick(method: PaymentMethod): void {
    this.confirmationService.confirm({
      header: 'Eliminar medio de pago',
      message: `¿Seguro que querés eliminar "${method.name}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'No',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => this.onDelete(method)
    });
  }

  private async onDelete(method: PaymentMethod): Promise<void> {
    this.deletingId.set(method.id);
    this.errorMessage.set(null);
    try {
      await this.store.delete(method.id);
    } catch (err) {
      console.error('No se pudo eliminar el medio de pago', err);
      // Un medio de pago usado en alguna venta no se puede borrar (FK) -- el mensaje generico
      // de postgres ("violates foreign key constraint") no es claro para el usuario final.
      const raw = extractErrorMessage(err, '');
      this.errorMessage.set(
        raw.includes('foreign key')
          ? `No se puede eliminar "${method.name}" porque ya se usó en ventas. Desactivalo en vez de borrarlo.`
          : raw || 'No se pudo eliminar el medio de pago.'
      );
    } finally {
      this.deletingId.set(null);
    }
  }
}
