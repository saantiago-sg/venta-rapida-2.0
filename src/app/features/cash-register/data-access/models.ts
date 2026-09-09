// El turno abierto actual -- shape minimo (sin nombre de quien abrio) porque se lee con un
// select directo via RLS, no via list_cash_sessions (esa RPC es security definer justamente
// para poder mostrar el nombre de otros empleados, ver la migracion). Alcanza con saber que
// hay un turno abierto y desde cuando para el banner de la pantalla Caja y para el gate de
// "Efectivo" en Vender.
export interface CurrentCashSession {
  id: string;
  openedAt: string;
  openingAmount: number;
}

// Fila del historial (via list_cash_sessions) -- ya viene con nombres resueltos y el indicador
// de cancelacion tardia calculado del lado del server.
export interface CashSessionHistoryRow {
  id: string;
  openedAt: string;
  openingAmount: number;
  openedByName: string;
  closedAt: string | null;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  closedByName: string | null;
  status: 'open' | 'closed';
  hasLateCancellation: boolean;
}

export interface CloseCashSessionResult {
  expectedAmount: number;
  closingAmount: number;
  difference: number;
}
