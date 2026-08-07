export type SaleStatus = 'completed' | 'cancelled';

export interface SaleListItem {
  id: string;
  saleNumber: number;
  customerName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string;
  paymentMethodIsCash: boolean;
  deliveryTypeName: string;
  status: SaleStatus;
  total: number;
  createdAt: string;
  cancelReason: string | null;
}

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
