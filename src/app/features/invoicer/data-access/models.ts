export type StandaloneInvoiceStatus = 'issued' | 'error';

export interface StandaloneInvoice {
  id: string;
  emissionDate: string;
  receptorName: string;
  montoTotal: number;
  status: StandaloneInvoiceStatus;
  cae: string | null;
  caeDueDate: string | null;
  comprobanteNumber: string | null;
  comprobanteTipo: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface IssueInvoiceInput {
  emissionDate: string;
  consumidorFinal: boolean;
  docType: 'DNI' | 'CUIT' | 'CUIL' | null;
  docNumber: string | null;
  receptorName: string | null;
  receptorCondicionIva: 'RI' | 'M' | 'E' | null;
  montoTotal: number;
  ivaRate: number | null;
}

export interface IssueInvoiceResult {
  ok: boolean;
  cae?: string;
  caeDueDate?: string | null;
  comprobanteNumber?: string;
  comprobanteTipo?: string;
  error?: string;
}

// Comprobante Tipo -> letra, para mostrar en la tabla de historial (AFIP devuelve el codigo
// numerico, no la letra).
export const COMPROBANTE_TIPO_LABEL: Record<string, string> = { '1': 'A', '6': 'B', '11': 'C' };

export const IVA_RATE_OPTIONS = [
  { label: '0%', value: 0 },
  { label: '10.5%', value: 10.5 },
  { label: '21%', value: 21 },
  { label: '27%', value: 27 }
];
