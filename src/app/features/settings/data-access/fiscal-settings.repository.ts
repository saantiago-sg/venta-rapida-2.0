import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { FiscalSettings, FiscalSettingsFormValue } from './models';

interface FiscalSettingsRow {
  business_id: string;
  electronic_invoicing_enabled: boolean;
  afip_punto_venta: string | null;
  tusfacturas_apitoken: string | null;
  tusfacturas_apikey: string | null;
  tusfacturas_usertoken: string | null;
  tusfacturas_webhook_token: string | null;
}

const SELECT_COLUMNS =
  'business_id, electronic_invoicing_enabled, afip_punto_venta, tusfacturas_apitoken, tusfacturas_apikey, tusfacturas_usertoken, tusfacturas_webhook_token';

function mapRow(row: FiscalSettingsRow): FiscalSettings {
  return {
    businessId: row.business_id,
    electronicInvoicingEnabled: row.electronic_invoicing_enabled,
    afipPuntoVenta: row.afip_punto_venta,
    tusfacturasApitoken: row.tusfacturas_apitoken,
    tusfacturasApikey: row.tusfacturas_apikey,
    tusfacturasUsertoken: row.tusfacturas_usertoken,
    tusfacturasWebhookToken: row.tusfacturas_webhook_token
  };
}

// No hay fila hasta que el dueño guarda la config por primera vez -- valores por defecto en
// blanco, mismo criterio que "no hay negocio" en otros repos de este feature.
function emptySettings(businessId: string): FiscalSettings {
  return {
    businessId,
    electronicInvoicingEnabled: false,
    afipPuntoVenta: null,
    tusfacturasApitoken: null,
    tusfacturasApikey: null,
    tusfacturasUsertoken: null,
    tusfacturasWebhookToken: null
  };
}

@Injectable({ providedIn: 'root' })
export class FiscalSettingsRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async get(businessId: string): Promise<FiscalSettings> {
    const { data, error } = await this.supabase
      .from('business_fiscal_settings')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as FiscalSettingsRow) : emptySettings(businessId);
  }

  async save(businessId: string, input: FiscalSettingsFormValue): Promise<FiscalSettings> {
    const { data, error } = await this.supabase
      .from('business_fiscal_settings')
      .upsert({
        business_id: businessId,
        electronic_invoicing_enabled: input.electronicInvoicingEnabled,
        afip_punto_venta: input.afipPuntoVenta,
        tusfacturas_apitoken: input.tusfacturasApitoken,
        tusfacturas_apikey: input.tusfacturasApikey,
        tusfacturas_usertoken: input.tusfacturasUsertoken,
        tusfacturas_webhook_token: input.tusfacturasWebhookToken
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data as FiscalSettingsRow);
  }
}
