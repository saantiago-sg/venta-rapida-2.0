export interface BusinessSettings {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cashDiscountPercentage: number;
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
export const PERMISSION_CATALOG: { key: string; label: string }[] = [
  { key: 'can_manage_products', label: 'Gestionar productos' },
  { key: 'can_manage_employees', label: 'Gestionar empleados' },
  { key: 'can_manage_settings', label: 'Gestionar configuración' },
  { key: 'can_cancel_sales', label: 'Cancelar ventas' },
  { key: 'can_view_reports', label: 'Ver reportes' },
  { key: 'can_manage_invoicing', label: 'Gestionar facturación electrónica' }
];
