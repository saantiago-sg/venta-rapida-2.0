import { Product } from '../../products/data-access/models';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ProcessSaleInput {
  businessId: string;
  items: { product_id: string; quantity: number }[];
  paymentMethodId: string;
  deliveryTypeId: string;
  customerId: string | null;
  cashReceived: number | null;
}

export interface SaleResult {
  id: string;
  saleNumber: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  changeGiven: number | null;
}

export interface InvoiceSaleResult {
  invoiced?: boolean;
  skipped?: boolean;
  error?: string;
}
