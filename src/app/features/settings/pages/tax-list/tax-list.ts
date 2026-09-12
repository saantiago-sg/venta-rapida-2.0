import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { TaxesStore } from '../../state/taxes.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tax-list',
  imports: [FormsModule, ButtonModule, InputNumberModule, InputTextModule, TableModule, ToggleSwitchModule],
  templateUrl: './tax-list.html'
})
export class TaxList {
  protected readonly store = inject(TaxesStore);
  protected readonly newName = signal('');
  protected readonly newRate = signal(0);
  protected readonly saving = signal(false);

  constructor() {
    this.store.load();
  }

  protected async onCreate(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;

    this.saving.set(true);
    try {
      await this.store.create(name, this.newRate());
      this.newName.set('');
      this.newRate.set(0);
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }
}
