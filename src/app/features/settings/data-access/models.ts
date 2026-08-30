export interface BusinessSettings {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cashDiscountPercentage: number;
  weightedBarcode: WeightedBarcodeConfig;
  onboardingCompleted: boolean;
}

export interface BusinessSettingsFormValue {
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cashDiscountPercentage: number;
}

// Config por negocio para decodificar los codigos de barras que imprime una balanza (EAN-13
// con el peso embebido) -- no todas las balanzas arman el numero igual, por eso es
// configurable en vez de asumir un formato fijo. Ver [[parseWeightedBarcode]] (pos/data-access)
// para como se usa al escanear.
export interface WeightedBarcodeConfig {
  enabled: boolean;
  prefix: string;
  productCodeDigits: number;
  weightDigits: number;
}

export const DEFAULT_WEIGHTED_BARCODE_CONFIG: WeightedBarcodeConfig = {
  enabled: false,
  prefix: '20',
  productCodeDigits: 5,
  weightDigits: 5
};

export interface Tax {
  id: string;
  businessId: string;
  name: string;
  rate: number;
  active: boolean;
}

export interface PaymentMethod {
  id: string;
  businessId: string;
  name: string;
  isCash: boolean;
  active: boolean;
  invoicingEnabled: boolean;
}

export interface FiscalSettings {
  businessId: string;
  electronicInvoicingEnabled: boolean;
  afipPuntoVenta: string | null;
  tusfacturasApitoken: string | null;
  tusfacturasApikey: string | null;
  tusfacturasUsertoken: string | null;
  tusfacturasWebhookToken: string | null;
}

export interface FiscalSettingsFormValue {
  electronicInvoicingEnabled: boolean;
  afipPuntoVenta: string | null;
  tusfacturasApitoken: string | null;
  tusfacturasApikey: string | null;
  tusfacturasUsertoken: string | null;
  tusfacturasWebhookToken: string | null;
}

export interface DeliveryType {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
}

export type EmployeeRole = 'owner' | 'admin' | 'cashier';

export interface Employee {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: EmployeeRole;
  permissions: string[];
  active: boolean;
}

export interface InviteEmployeeInput {
  email: string;
  fullName: string | null;
  role: 'admin' | 'cashier';
  permissions: string[];
  password: string;
}

// Solo se listan permisos que hoy tienen un efecto real en la app (RLS o guard de ruta) --
// mostrar un toggle que no hace nada seria enganoso para el dueno.
export const PERMISSION_CATALOG: { key: string; label: string; description: string }[] = [
  { key: 'can_manage_products', label: 'Gestionar productos', description: 'Crear y editar productos y categorías' },
  { key: 'can_manage_employees', label: 'Gestionar empleados', description: 'Invitar empleados y cambiar sus roles/permisos' },
  {
    key: 'can_manage_settings',
    label: 'Gestionar configuración',
    description: 'Medios de pago, impuestos, tipos de entrega y datos del negocio'
  },
  { key: 'can_cancel_sales', label: 'Cancelar ventas', description: 'Anular una venta ya cargada' },
  { key: 'can_view_reports', label: 'Ver reportes', description: 'Ver estadísticas y reportes del negocio' },
  {
    key: 'can_manage_invoicing',
    label: 'Gestionar facturación electrónica',
    description: 'Configurar la facturación electrónica (AFIP)'
  }
];
