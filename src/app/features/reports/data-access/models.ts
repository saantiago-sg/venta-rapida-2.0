export interface SalesSummary {
  totalSales: number;
  totalProfit: number;
  totalTax: number;
  saleCount: number;
}

export interface TopProduct {
  productName: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}

export type ReportRangePreset = 'today' | 'last7days' | 'thisMonth';
