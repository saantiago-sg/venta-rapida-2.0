import { Injectable, inject } from '@angular/core';

import { SupabaseClientService } from '../../../core/supabase/supabase-client.service';
import { CashSessionHistoryRow, CloseCashSessionResult, CurrentCashSession } from './models';

interface OpenSessionRow {
  id: string;
  opened_at: string;
  opening_amount: number;
}

interface HistoryRow {
  id: string;
  opened_at: string;
  opening_amount: number;
  opened_by_name: string;
  closed_at: string | null;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  closed_by_name: string | null;
  status: 'open' | 'closed';
  has_late_cancellation: boolean;
}

interface CloseSessionRow {
  expected_amount: number;
  closing_amount: number;
  difference: number;
}

@Injectable({ providedIn: 'root' })
export class CashSessionRepository {
  private readonly supabase = inject(SupabaseClientService).client;

  // Select directo via RLS (cash_sessions_select), no una RPC -- alcanza con saber si hay un
  // turno abierto y su monto inicial, y esto se llama seguido (cada vez que se abre Vender).
  async getOpenSession(businessId: string): Promise<CurrentCashSession | null> {
    const { data, error } = await this.supabase
      .from('cash_sessions')
      .select('id, opened_at, opening_amount')
      .eq('business_id', businessId)
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw error;
    const row = data as OpenSessionRow | null;
    return row ? { id: row.id, openedAt: row.opened_at, openingAmount: row.opening_amount } : null;
  }

  async open(businessId: string, openingAmount: number): Promise<CurrentCashSession> {
    const { data, error } = await this.supabase.rpc('open_cash_session', {
      p_business_id: businessId,
      p_opening_amount: openingAmount
    });
    if (error) throw error;
    const row = data as OpenSessionRow;
    return { id: row.id, openedAt: row.opened_at, openingAmount: row.opening_amount };
  }

  async close(sessionId: string, closingAmount: number): Promise<CloseCashSessionResult> {
    const { data, error } = await this.supabase.rpc('close_cash_session', {
      p_session_id: sessionId,
      p_closing_amount: closingAmount
    });
    if (error) throw error;
    const row = data as CloseSessionRow;
    return { expectedAmount: row.expected_amount, closingAmount: row.closing_amount, difference: row.difference };
  }

  async list(businessId: string): Promise<CashSessionHistoryRow[]> {
    const { data, error } = await this.supabase.rpc('list_cash_sessions', { p_business_id: businessId });
    if (error) throw error;
    return (data as HistoryRow[]).map((row) => ({
      id: row.id,
      openedAt: row.opened_at,
      openingAmount: row.opening_amount,
      openedByName: row.opened_by_name,
      closedAt: row.closed_at,
      closingAmount: row.closing_amount,
      expectedAmount: row.expected_amount,
      difference: row.difference,
      closedByName: row.closed_by_name,
      status: row.status,
      hasLateCancellation: row.has_late_cancellation
    }));
  }
}
