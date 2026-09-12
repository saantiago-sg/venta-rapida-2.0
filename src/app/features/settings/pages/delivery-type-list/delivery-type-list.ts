import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { DeliveryTypesStore } from '../../state/delivery-types.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-delivery-type-list',
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, ToggleSwitchModule],
  templateUrl: './delivery-type-list.html'
})
export class DeliveryTypeList {
  protected readonly store = inject(DeliveryTypesStore);
  protected readonly newName = signal('');
  protected readonly saving = signal(false);

  constructor() {
    this.store.load();
  }

  protected async onCreate(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;

    this.saving.set(true);
    try {
      await this.store.create(name);
      this.newName.set('');
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }
}
