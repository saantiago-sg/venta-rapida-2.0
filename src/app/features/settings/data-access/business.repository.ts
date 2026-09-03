import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import {
  BusinessSettings,
  BusinessSettingsFormValue,
  DEFAULT_TICKET_SETTINGS,
  DEFAULT_WEIGHTED_BARCODE_CONFIG,
  TicketPaperWidthMm,
  TicketSettings,
  WeightedBarcodeConfig
} from './models';

interface WeightedBarcodeConfigRow {
  enabled: boolean;
  prefix: string;
  product_code_digits: number;
  weight_digits: number;
}

interface TicketSettingsRow {
  auto_print_enabled: boolean;
  paper_width_mm: TicketPaperWidthMm;
  header_text: string | null;
  footer_text: string | null;
}

interface BusinessSettingsJson {
  weighted_barcode?: WeightedBarcodeConfigRow;
  ticket?: TicketSettingsRow;
  [key: string]: unknown;
}

interface BusinessRow {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cash_discount_percentage: number;
  settings: BusinessSettingsJson | null;
  onboarding_completed: boolean;
}

const SELECT_COLUMNS =
  'id, name, legal_name, tax_id, email, phone, address, cash_discount_percentage, settings, onboarding_completed';

function mapWeightedBarcode(row: WeightedBarcodeConfigRow | undefined): WeightedBarcodeConfig {
  if (!row) return DEFAULT_WEIGHTED_BARCODE_CONFIG;
  return {
    enabled: row.enabled,
    prefix: row.prefix,
    productCodeDigits: row.product_code_digits,
    weightDigits: row.weight_digits
  };
}

function mapTicketSettings(row: TicketSettingsRow | undefined): TicketSettings {
  if (!row) return DEFAULT_TICKET_SETTINGS;
  return {
    autoPrintEnabled: row.auto_print_enabled,
    paperWidthMm: row.paper_width_mm,
    headerText: row.header_text,
    footerText: row.footer_text
  };
}

function mapRow(row: BusinessRow): BusinessSettings {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    address: row.address,
    cashDiscountPercentage: row.cash_discount_percentage,
    weightedBarcode: mapWeightedBarcode(row.settings?.weighted_barcode),
    ticketSettings: mapTicketSettings(row.settings?.ticket),
    onboardingCompleted: row.onboarding_completed
  };
}

@Injectable({ providedIn: 'root' })
export class BusinessRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  async get(businessId: string): Promise<BusinessSettings> {
    const { data, error } = await this.supabase
      .from('businesses')
      .select(SELECT_COLUMNS)
      .eq('id', businessId)
      .single();
    if (error) throw error;
    return mapRow(data as BusinessRow);
  }

  async update(businessId: string, input: BusinessSettingsFormValue): Promise<void> {
    const { error } = await this.supabase
      .from('businesses')
      .update({
        name: input.name,
        legal_name: input.legalName,
        tax_id: input.taxId,
        email: input.email,
        phone: input.phone,
        address: input.address,
        cash_discount_percentage: input.cashDiscountPercentage
      })
      .eq('id', businessId);
    if (error) throw error;
  }

  // Merge en vez de reemplazo directo: 'settings' es un jsonb generico que a futuro puede
  // guardar otras claves ademas de weighted_barcode -- pisarlo entero borraria lo demas.
  async updateWeightedBarcode(businessId: string, config: WeightedBarcodeConfig): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .single();
    if (fetchError) throw fetchError;

    const settings: BusinessSettingsJson = {
      ...((data as { settings: BusinessSettingsJson | null }).settings ?? {}),
      weighted_barcode: {
        enabled: config.enabled,
        prefix: config.prefix,
        product_code_digits: config.productCodeDigits,
        weight_digits: config.weightDigits
      }
    };

    const { error } = await this.supabase.from('businesses').update({ settings }).eq('id', businessId);
    if (error) throw error;
  }

  // Mismo criterio de merge que updateWeightedBarcode -- 'settings' es jsonb generico compartido
  // por varias configs opcionales.
  async updateTicketSettings(businessId: string, config: TicketSettings): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .single();
    if (fetchError) throw fetchError;

    const settings: BusinessSettingsJson = {
      ...((data as { settings: BusinessSettingsJson | null }).settings ?? {}),
      ticket: {
        auto_print_enabled: config.autoPrintEnabled,
        paper_width_mm: config.paperWidthMm,
        header_text: config.headerText,
        footer_text: config.footerText
      }
    };

    const { error } = await this.supabase.from('businesses').update({ settings }).eq('id', businessId);
    if (error) throw error;
  }

  async completeOnboarding(businessId: string): Promise<void> {
    const { error } = await this.supabase
      .from('businesses')
      .update({ onboarding_completed: true })
      .eq('id', businessId);
    if (error) throw error;
  }
}
