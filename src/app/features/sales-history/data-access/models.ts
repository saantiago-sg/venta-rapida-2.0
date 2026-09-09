export type SaleStatus = 'completed' | 'cancelled';

export interface SaleListItem {
  id: string;
  saleNumber: number;
  customerName: string | null;
  employeeEmail: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string;
  paymentMethodIsCash: boolean;
  deliveryTypeName: string;
  status: SaleStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  profit: number;
  createdAt: string;
  cancelReason: string | null;
}

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  subtotal: number;
}
