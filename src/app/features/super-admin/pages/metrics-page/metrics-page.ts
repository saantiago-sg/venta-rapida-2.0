import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { SuperAdminStore } from '../../state/super-admin.store';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  cashier: 'Cajero'
};

@Component({
  selector: 'app-metrics-page',
  imports: [DatePipe, TableModule, TagModule, CountUpDirective],
  templateUrl: './metrics-page.html'
})
export class MetricsPage {
  protected readonly store = inject(SuperAdminStore);

  constructor() {
    this.store.loadMetrics();
    this.store.loadUsers();
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }
}
