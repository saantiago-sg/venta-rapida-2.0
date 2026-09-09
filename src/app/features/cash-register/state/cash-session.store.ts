import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { CashSessionRepository } from '../data-access/cash-session.repository';
import { CashSessionHistoryRow, CloseCashSessionResult, CurrentCashSession } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class CashSessionStore {
  private readonly repository = inject(CashSessionRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _currentSession = signal<CurrentCashSession | null>(null);
  private readonly _sessions = signal<CashSessionHistoryRow[]>([]);
  private readonly _loadingCurrent = signal(false);
  private readonly _loadingHistory = signal(false);

  readonly currentSession = this._currentSession.asReadonly();
  // Se usa en Vender para habilitar/deshabilitar el medio de pago Efectivo -- ver payment-panel.
  readonly hasOpenSession = computed(() => this._currentSession() !== null);
  readonly sessions = this._sessions.asReadonly();
  readonly loadingCurrent = this._loadingCurrent.asReadonly();
  readonly loadingHistory = this._loadingHistory.asReadonly();

  async loadCurrent(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loadingCurrent.set(true);
    try {
      this._currentSession.set(await this.repository.getOpenSession(businessId));
    } finally {
      this._loadingCurrent.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loadingHistory.set(true);
    try {
      this._sessions.set(await this.repository.list(businessId));
    } finally {
      this._loadingHistory.set(false);
    }
  }

  async open(openingAmount: number): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    const session = await this.repository.open(businessId, openingAmount);
    this._currentSession.set(session);
  }

  async close(closingAmount: number): Promise<CloseCashSessionResult> {
    const session = this._currentSession();
    if (!session) throw new Error('No hay un turno abierto');

    const result = await this.repository.close(session.id, closingAmount);
    this._currentSession.set(null);
    return result;
  }
}
