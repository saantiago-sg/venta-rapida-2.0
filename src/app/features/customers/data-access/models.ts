export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  documentType: string | null;
  ivaCondition: string | null;
  province: string | null;
}

export interface CustomerFormValue {
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  documentType: string | null;
  ivaCondition: string | null;
  province: string | null;
}

// Códigos que espera TusFacturasAPP para facturar a nombre de un cliente en vez de "Consumidor
// Final sin datos" -- solo hace falta completarlos si se quiere facturar a esa persona/empresa.
export const DOCUMENT_TYPE_OPTIONS = [
  { label: 'DNI', value: 'DNI' },
  { label: 'CUIT', value: 'CUIT' },
  { label: 'CUIL', value: 'CUIL' }
];

export const IVA_CONDITION_OPTIONS = [
  { label: 'Consumidor Final', value: 'CF' },
  { label: 'Responsable Inscripto', value: 'RI' },
  { label: 'Monotributo', value: 'M' },
  { label: 'Exento', value: 'E' }
];
