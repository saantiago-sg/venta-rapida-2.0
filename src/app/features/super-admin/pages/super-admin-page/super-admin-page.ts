import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { SuperAdminStore } from '../../state/super-admin.store';

@Component({
  selector: 'app-super-admin-page',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, TableModule, TagModule],
  templateUrl: './super-admin-page.html'
})
export class SuperAdminPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(SuperAdminStore);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    businessName: ['', Validators.required],
    ownerFullName: [''],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    this.store.load();
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const value = this.form.getRawValue();
      await this.store.createBusiness(value);
      this.successMessage.set(`Negocio "${value.businessName}" creado. Owner: ${value.ownerEmail}`);
      this.form.reset({ businessName: '', ownerFullName: '', ownerEmail: '', ownerPassword: '' });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo crear el negocio.');
    } finally {
      this.saving.set(false);
    }
  }
}
