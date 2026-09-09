import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { AuthStore } from '../../../../core/auth/auth.store';
import { Employee, PERMISSION_CATALOG } from '../../data-access/models';
import { EmployeesStore } from '../../state/employees.store';

const ROLE_OPTIONS = [
  { label: 'Administrador', value: 'admin' },
  { label: 'Cajero', value: 'cashier' }
];

// Preset de permisos al invitar segun el rol elegido (Fase 4 del diseño).
// can_manage_cash_movements es la unica excepcion habilitada por default para cajero: abrir/
// cerrar caja es una tarea operativa diaria (como vender), no una accion sensible como cancelar
// ventas -- el resto del catalogo sigue apagado por default y se habilita permiso a permiso.
const ROLE_DEFAULT_PERMISSIONS: Record<'admin' | 'cashier', string[]> = {
  admin: PERMISSION_CATALOG.map((p) => p.key),
  cashier: ['can_manage_cash_movements']
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
  private readonly authStore = inject(AuthStore);
  protected readonly store = inject(EmployeesStore);

  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly permissionCatalog = PERMISSION_CATALOG;

  // Gatea especificamente la accion de resetear contraseña -- independiente de que el resto
  // de esta pantalla hoy no tenga esta misma verificacion por seccion.
  protected readonly canManageEmployees = computed(() => this.authStore.hasPermission('can_manage_employees'));

  protected readonly inviteDialogVisible = signal(false);
  protected readonly permissionsDialogVisible = signal(false);
  protected readonly resetPasswordDialogVisible = signal(false);
  protected readonly editingEmployee = signal<Employee | null>(null);
  protected readonly editingPermissions = signal<string[]>([]);
  protected readonly resettingEmployee = signal<Employee | null>(null);
  protected readonly resetSuccessMessage = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly resetPasswordForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

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

  protected openResetPassword(employee: Employee): void {
    this.resettingEmployee.set(employee);
    this.resetPasswordForm.reset({ password: '' });
    this.errorMessage.set(null);
    this.resetSuccessMessage.set(null);
    this.resetPasswordDialogVisible.set(true);
  }

  protected async onResetPassword(): Promise<void> {
    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    const employee = this.resettingEmployee();
    if (!employee) return;

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const { password } = this.resetPasswordForm.getRawValue();
      await this.store.resetPassword(employee.membershipId, password);
      this.resetSuccessMessage.set('Contraseña actualizada. Comunicásela al empleado por fuera del sistema.');
      // Se deja un momento a la vista antes de cerrar solo, para que le de tiempo a leerlo.
      setTimeout(() => this.resetPasswordDialogVisible.set(false), 1600);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo resetear la contraseña.');
    } finally {
      this.saving.set(false);
    }
  }
}
