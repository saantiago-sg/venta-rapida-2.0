import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { AuthStore } from '../../../../core/auth/auth.store';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { ReportsRepository } from '../../../reports/data-access/reports.repository';
import { SalesSummary, TopProduct } from '../../../reports/data-access/models';

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard-page',
  imports: [DecimalPipe, RouterLink, ButtonModule, CountUpDirective],
  templateUrl: './dashboard-page.html'
})
export class DashboardPage {
  private readonly reportsRepository = inject(ReportsRepository);
  private readonly authStore = inject(AuthStore);

  protected readonly today = new Date();
  protected readonly formattedDate = capitalizeFirst(
    this.today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  );
  protected readonly loading = signal(true);
  protected readonly summary = signal<SalesSummary | null>(null);
  protected readonly topProducts = signal<TopProduct[]>([]);

  protected readonly averageTicket = computed(() => {
    const s = this.summary();
    if (!s || s.saleCount === 0) return 0;
    return s.totalSales / s.saleCount;
  });

  protected readonly mostProfitable = computed(() =>
    [...this.topProducts()].sort((a, b) => b.profit - a.profit).slice(0, 5)
  );

  protected readonly leastProfitable = computed(() =>
    [...this.topProducts()].sort((a, b) => a.profit - b.profit).slice(0, 3)
  );

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this.loading.set(true);
    try {
      const from = startOfToday();
      const to = startOfTomorrow();
      const [summary, topProducts] = await Promise.all([
        this.reportsRepository.getSummary(businessId, from, to),
        this.reportsRepository.getTopProducts(businessId, from, to, 20)
      ]);
      this.summary.set(summary);
      this.topProducts.set(topProducts);
    } finally {
      this.loading.set(false);
    }
  }
}
