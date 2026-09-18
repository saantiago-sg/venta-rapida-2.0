import { Injectable, inject, signal } from '@angular/core';

import { AuthStore } from '../../../core/auth/auth.store';
import { EmployeeRepository } from '../data-access/employee.repository';
import { Employee, InviteEmployeeInput } from '../data-access/models';

@Injectable({ providedIn: 'root' })
export class EmployeesStore {
  private readonly repository = inject(EmployeeRepository);
  private readonly authStore = inject(AuthStore);

  private readonly _employees = signal<Employee[]>([]);
  private readonly _loading = signal(false);

  readonly employees = this._employees.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache por negocio activo (ver ProductsStore.load()).
  private loadedForBusinessId: string | null = null;
  private loadPromise: Promise<void> | null = null;

  async load(force = false): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;
    if (!force && this.loadedForBusinessId === businessId) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      this._loading.set(true);
      try {
        this._employees.set(await this.repository.list(businessId));
        this.loadedForBusinessId = businessId;
      } finally {
        this._loading.set(false);
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async invite(input: InviteEmployeeInput): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.invite(businessId, input);
    await this.load(true);
  }

  async updateRole(membershipId: string, role: 'admin' | 'cashier'): Promise<void> {
    await this.repository.updateRole(membershipId, role);
    this._employees.update((list) => list.map((e) => (e.membershipId === membershipId ? { ...e, role } : e)));
  }

  async updatePermissions(membershipId: string, permissions: string[]): Promise<void> {
    await this.repository.updatePermissions(membershipId, permissions);
    this._employees.update((list) =>
      list.map((e) => (e.membershipId === membershipId ? { ...e, permissions } : e))
    );
  }

  async setActive(membershipId: string, active: boolean): Promise<void> {
    await this.repository.setActive(membershipId, active);
    this._employees.update((list) => list.map((e) => (e.membershipId === membershipId ? { ...e, active } : e)));
  }

  async resetPassword(membershipId: string, password: string): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.resetPassword(businessId, membershipId, password);
  }
}
