import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { PaymentMethodsStore } from '../../state/payment-methods.store';

@Component({
  selector: 'app-payment-method-list',
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, TagModule, ToggleSwitchModule],
  templateUrl: './payment-method-list.html'
})
export class PaymentMethodList {
  protected readonly store = inject(PaymentMethodsStore);
  protected readonly newName = signal('');
  protected readonly newIsCash = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    this.store.load();
  }

  protected async onCreate(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;

    this.saving.set(true);
    try {
      await this.store.create(name, this.newIsCash());
      this.newName.set('');
      this.newIsCash.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }

  protected onToggleInvoicing(id: string, invoicingEnabled: boolean): void {
    this.store.setInvoicingEnabled(id, invoicingEnabled);
  }
}
