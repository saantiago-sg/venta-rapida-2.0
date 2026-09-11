import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { AdminBusiness, SubscriptionStatus } from '../../data-access/business-admin.repository';
import { SuperAdminStore } from '../../state/super-admin.store';

const SUBSCRIPTION_STATUS_OPTIONS: { label: string; value: SubscriptionStatus }[] = [
  { label: 'Prueba', value: 'trial' },
  { label: 'Al día', value: 'active' },
  { label: 'Vencida', value: 'past_due' },
  { label: 'Cancelada', value: 'cancelled' }
];

@Component({
  selector: 'app-businesses-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    ToggleSwitchModule
  ],
  templateUrl: './businesses-page.html'
})
export class BusinessesPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(SuperAdminStore);

  protected readonly statusOptions = SUBSCRIPTION_STATUS_OPTIONS;
  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly deleteDialogVisible = signal(false);
  protected readonly deleteTarget = signal<AdminBusiness | null>(null);
  protected readonly deleteConfirmText = signal('');
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    businessName: ['', Validators.required],
    ownerFullName: [''],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    this.store.load();
  }

  protected openCreate(): void {
    this.errorMessage.set(null);
    this.form.reset({ businessName: '', ownerFullName: '', ownerEmail: '', ownerPassword: '' });
    this.dialogVisible.set(true);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      await this.store.createBusiness(this.form.getRawValue());
      this.dialogVisible.set(false);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear el negocio.');
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }

  protected onStatusChange(id: string, status: SubscriptionStatus): void {
    this.store.setSubscriptionStatus(id, status);
  }

  protected openDelete(business: AdminBusiness): void {
    this.deleteTarget.set(business);
    this.deleteConfirmText.set('');
    this.deleteError.set(null);
    this.deleteDialogVisible.set(true);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target || this.deleteConfirmText() !== target.name) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    try {
      await this.store.deleteBusiness(target.id);
      this.deleteDialogVisible.set(false);
    } catch (err) {
      this.deleteError.set(err instanceof Error ? err.message : 'No se pudo eliminar el negocio.');
    } finally {
      this.deleting.set(false);
    }
  }
}
