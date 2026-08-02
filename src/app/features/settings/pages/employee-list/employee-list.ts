import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { Employee, PERMISSION_CATALOG } from '../../data-access/models';
import { EmployeesStore } from '../../state/employees.store';

const ROLE_OPTIONS = [
  { label: 'Administrador', value: 'admin' },
  { label: 'Cajero', value: 'cashier' }
];

// Preset de permisos al invitar segun el rol elegido (Fase 4 del diseño).
const ROLE_DEFAULT_PERMISSIONS: Record<'admin' | 'cashier', string[]> = {
  admin: PERMISSION_CATALOG.map((p) => p.key),
  cashier: []
};

@Component({
  selector: 'app-employee-list',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule
  ],
  templateUrl: './employee-list.html'
})
export class EmployeeList {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(EmployeesStore);

  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly permissionCatalog = PERMISSION_CATALOG;

  protected readonly inviteDialogVisible = signal(false);
  protected readonly permissionsDialogVisible = signal(false);
  protected readonly editingEmployee = signal<Employee | null>(null);
  protected readonly editingPermissions = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    fullName: [''],
    role: this.fb.nonNullable.control<'admin' | 'cashier'>('cashier'),
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    this.store.load();
  }

  protected openInvite(): void {
    this.errorMessage.set(null);
    this.inviteForm.reset({ email: '', fullName: '', role: 'cashier', password: '' });
    this.inviteDialogVisible.set(true);
  }

  protected async onInvite(): Promise<void> {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const raw = this.inviteForm.getRawValue();
      await this.store.invite({
        email: raw.email,
        fullName: raw.fullName || null,
        role: raw.role,
        permissions: ROLE_DEFAULT_PERMISSIONS[raw.role],
        password: raw.password
      });
      this.inviteDialogVisible.set(false);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo invitar al empleado.');
    } finally {
      this.saving.set(false);
    }
  }

  protected onRoleChange(employee: Employee, role: 'admin' | 'cashier'): void {
    this.store.updateRole(employee.membershipId, role);
  }

  protected onToggleActive(employee: Employee, active: boolean): void {
    this.store.setActive(employee.membershipId, active);
  }

  protected openPermissions(employee: Employee): void {
    this.editingEmployee.set(employee);
    this.editingPermissions.set([...employee.permissions]);
    this.permissionsDialogVisible.set(true);
  }

  protected isPermissionChecked(key: string): boolean {
    return this.editingPermissions().includes(key);
  }

  protected togglePermission(key: string, checked: boolean): void {
    this.editingPermissions.update((list) =>
      checked ? [...list, key] : list.filter((p) => p !== key)
    );
  }

  protected async onSavePermissions(): Promise<void> {
    const employee = this.editingEmployee();
    if (!employee) return;

    this.saving.set(true);
    try {
      await this.store.updatePermissions(employee.membershipId, this.editingPermissions());
      this.permissionsDialogVisible.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
