import { Component, inject } from '@angular/core';

import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { SuperAdminStore } from '../../state/super-admin.store';

@Component({
  selector: 'app-metrics-page',
  imports: [CountUpDirective],
  templateUrl: './metrics-page.html'
})
export class MetricsPage {
  protected readonly store = inject(SuperAdminStore);

  constructor() {
    this.store.loadMetrics();
  }
}
