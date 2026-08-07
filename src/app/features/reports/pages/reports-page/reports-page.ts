import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';

import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { ReportRangePreset } from '../../data-access/models';
import { ReportsStore } from '../../state/reports.store';

const PRESET_OPTIONS: { label: string; value: ReportRangePreset }[] = [
  { label: 'Hoy', value: 'today' },
  { label: 'Últimos 7 días', value: 'last7days' },
  { label: 'Este mes', value: 'thisMonth' }
];

@Component({
  selector: 'app-reports-page',
  imports: [DecimalPipe, ButtonModule, TableModule, CountUpDirective],
  templateUrl: './reports-page.html'
})
export class ReportsPage {
  protected readonly store = inject(ReportsStore);
  protected readonly presetOptions = PRESET_OPTIONS;

  constructor() {
    this.store.load();
  }

  protected onPresetChange(preset: ReportRangePreset): void {
    this.store.setPreset(preset);
  }

  protected onExportCsv(): void {
    const rows = [['Producto', 'Cantidad vendida', 'Ingresos']];
    for (const product of this.store.topProducts()) {
      rows.push([product.productName, String(product.quantitySold), product.revenue.toFixed(2)]);
    }

    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-ventas-${this.store.preset()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected onExportPdf(): void {
    window.print();
  }
}
