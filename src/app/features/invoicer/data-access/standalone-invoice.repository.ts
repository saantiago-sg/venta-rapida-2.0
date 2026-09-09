import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { IssueInvoiceInput, IssueInvoiceResult, StandaloneInvoice, StandaloneInvoiceStatus } from './models';

interface StandaloneInvoiceRow {
  id: string;
  emission_date: string;
  receptor_name: string;
  monto_total: number;
  status: StandaloneInvoiceStatus;
  cae: string | null;
  cae_due_date: string | null;
  comprobante_number: string | null;
  comprobante_tipo: string | null;
  error_message: string | null;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, emission_date, receptor_name, monto_total, status, cae, cae_due_date, comprobante_number, comprobante_tipo, error_message, created_at';

function mapRow(row: StandaloneInvoiceRow): StandaloneInvoice {
  return {
    id: row.id,
    emissionDate: row.emission_date,
    receptorName: row.receptor_name,
    montoTotal: row.monto_total,
    status: row.status,
    cae: row.cae,
    caeDueDate: row.cae_due_date,
    comprobanteNumber: row.comprobante_number,
    comprobanteTipo: row.comprobante_tipo,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

@Injectable({ providedIn: 'root' })
export class StandaloneInvoiceRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async issue(businessId: string, input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const { data, error } = await this.supabase.functions.invoke('issue-standalone-invoice', {
      body: {
        businessId,
        emissionDate: input.emissionDate,
        consumidorFinal: input.consumidorFinal,
        docType: input.docType,
        docNumber: input.docNumber,
        receptorName: input.receptorName,
        receptorCondicionIva: input.receptorCondicionIva,
        montoTotal: input.montoTotal,
        ivaRate: input.ivaRate
      }
    });
    if (error) throw error;
    return data as IssueInvoiceResult;
  }

  async list(businessId: string): Promise<StandaloneInvoice[]> {
    const { data, error } = await this.supabase
      .from('standalone_invoices')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as StandaloneInvoiceRow[]).map(mapRow);
  }
}
