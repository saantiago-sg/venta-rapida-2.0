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

  async load(): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    this._loading.set(true);
    try {
      this._employees.set(await this.repository.list(businessId));
    } finally {
      this._loading.set(false);
    }
  }

  async invite(input: InviteEmployeeInput): Promise<void> {
    const businessId = this.authStore.activeBusinessId();
    if (!businessId) return;

    await this.repository.invite(businessId, input);
    await this.load();
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
}
