export interface Category {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
}

export type SaleType = 'unit' | 'weight';

// Un combo (ej. "Promo Fernet con Coca") es un producto que se vende como una sola linea a
// su propio precio, pero no tiene stock propio -- al venderse descuenta stock de sus
// componentes reales. componentProductName es solo para mostrar en el picker/lista, no se
// manda al guardar (ver ProductFormValue).
export interface ProductComponent {
  componentProductId: string;
  componentProductName: string;
  quantity: number;
}

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
  isCombo: boolean;
  // 'yyyy-mm-dd' o null si el producto no vence. Ver src/app/shared/utils/expiration.ts.
  expirationDate: string | null;
  // Solo se completa cuando se pide explicito (ver ProductRepository.getComponents) --
  // list() no lo trae para no cargar el listado con datos que casi nunca hacen falta.
  components: ProductComponent[];
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
  isCombo: boolean;
  expirationDate: string | null;
  components: { componentProductId: string; quantity: number }[];
}
