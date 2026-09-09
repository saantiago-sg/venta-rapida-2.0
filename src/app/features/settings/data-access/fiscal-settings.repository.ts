import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { ArcaEnvironment, EmisorCondicionIva, FiscalSettings, FiscalSettingsFormValue } from './models';

interface FiscalSettingsRow {
  business_id: string;
  electronic_invoicing_enabled: boolean;
  arca_environment: ArcaEnvironment;
  afip_punto_venta: string | null;
  emisor_condicion_iva: EmisorCondicionIva | null;
  arca_cert_secret_id: string | null;
}

const SELECT_COLUMNS =
  'business_id, electronic_invoicing_enabled, arca_environment, afip_punto_venta, emisor_condicion_iva, arca_cert_secret_id';

function mapRow(row: FiscalSettingsRow): FiscalSettings {
  return {
    businessId: row.business_id,
    electronicInvoicingEnabled: row.electronic_invoicing_enabled,
    arcaEnvironment: row.arca_environment,
    afipPuntoVenta: row.afip_punto_venta,
    emisorCondicionIva: row.emisor_condicion_iva,
    hasCertificate: row.arca_cert_secret_id !== null
  };
}

// No hay fila hasta que el dueño guarda la config por primera vez.
function emptySettings(businessId: string): FiscalSettings {
  return {
    businessId,
    electronicInvoicingEnabled: false,
    arcaEnvironment: 'homologacion',
    afipPuntoVenta: null,
    emisorCondicionIva: null,
    hasCertificate: false
  };
}

@Injectable({ providedIn: 'root' })
export class FiscalSettingsRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async get(businessId: string): Promise<FiscalSettings> {
    // Select directo: el certificado/clave en si nunca estan en esta tabla (viven en Vault,
    // referenciados solo por id) asi que no hace falta pasar por una Edge Function para leer
    // esto -- RLS (can_manage_invoicing) ya alcanza.
    const { data, error } = await this.supabase
      .from('business_fiscal_settings')
      .select(SELECT_COLUMNS)
      .eq('business_id', businessId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as FiscalSettingsRow) : emptySettings(businessId);
  }

  // Guardar SI pasa por una Edge Function: escribir el certificado nuevo (cuando viene) implica
  // llamar a Supabase Vault, que solo puede tocar la funcion security definer
  // save_fiscal_credentials -- no accesible por un upsert normal ni con can_manage_invoicing.
  async save(businessId: string, input: FiscalSettingsFormValue): Promise<FiscalSettings> {
    const { data, error } = await this.supabase.functions.invoke('save-fiscal-settings', {
      body: {
        businessId,
        electronicInvoicingEnabled: input.electronicInvoicingEnabled,
        arcaEnvironment: input.arcaEnvironment,
        afipPuntoVenta: input.afipPuntoVenta,
        emisorCondicionIva: input.emisorCondicionIva,
        cert: input.cert,
        privateKey: input.privateKey
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const settings = data.settings as {
      electronicInvoicingEnabled: boolean;
      arcaEnvironment: ArcaEnvironment;
      afipPuntoVenta: string | null;
      emisorCondicionIva: EmisorCondicionIva | null;
      hasCertificate: boolean;
    };
    return { businessId, ...settings };
  }
}
