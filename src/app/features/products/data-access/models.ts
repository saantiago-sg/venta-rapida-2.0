export interface Category {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
}

export type SaleType = 'unit' | 'weight';

export interface Product {
  id: string;
  businessId: string;
  categoryId: string | null;
  categoryName: string | null;
  taxId: string | null;
  taxName: string | null;
  taxRate: number | null;
  name: string;
  barcode: string | null;
  saleType: SaleType;
  price: number;
  cost: number;
  stock: number;
  trackStock: boolean;
  active: boolean;
}

export interface ProductFormValue {
  categoryId: string | null;
  taxId: string | null;
  name: string;
  barcode: string | null;
  saleType: SaleType;
  price: number;
  cost: number;
  trackStock: boolean;
  initialStock: number;
}
