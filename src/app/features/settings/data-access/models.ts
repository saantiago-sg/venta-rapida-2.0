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
}

export interface DeliveryType {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
}
