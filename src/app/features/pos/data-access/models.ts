import { Product } from '../../products/data-access/models';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ProcessSaleItemInput {
  product_id: string;
  quantity: number;
  // Precio/costo/impuesto del producto en el momento de vender -- solo se usan del lado del
  // server cuando la venta viaja con clientReference (sincronizacion offline); el camino
  // online normal los ignora y siempre recalcula con el precio actual del producto.
  unit_price: number;
  unit_cost: number;
  tax_rate: number;
}

export interface ProcessSaleInput {
  businessId: string;
  items: ProcessSaleItemInput[];
  paymentMethodId: string;
  deliveryTypeId: string;
  customerId: string | null;
  cashReceived: number | null;
  clientReference?: string;
}

export interface SaleResult {
  id: string;
  saleNumber: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  changeGiven: number | null;
  // true cuando no se pudo confirmar por falta de conexion y quedo encolada localmente --
  // saleNumber es un valor de relleno (0), el numero real se asigna recien al sincronizar.
  pending?: boolean;
}

export interface InvoiceSaleResult {
  invoiced?: boolean;
  skipped?: boolean;
  error?: string;
}
