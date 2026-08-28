export type SaleStatus = 'completed' | 'cancelled';

export type InvoiceStatus = 'queued' | 'issued' | 'error' | 'credit_note_pending' | 'credit_note_issued';

export interface SaleInvoice {
  status: InvoiceStatus;
  pdfUrl: string | null;
  ticketUrl: string | null;
  errorMessage: string | null;
}

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
  invoice: SaleInvoice | null;
}

export interface SaleItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  subtotal: number;
}
