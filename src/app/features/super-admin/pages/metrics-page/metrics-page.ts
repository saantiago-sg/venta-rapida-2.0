import { Component, inject } from '@angular/core';

import { SuperAdminStore } from '../../state/super-admin.store';

@Component({
  selector: 'app-metrics-page',
  templateUrl: './metrics-page.html'
})
export class MetricsPage {
  protected readonly store = inject(SuperAdminStore);

  constructor() {
    this.store.loadMetrics();
  }
}
