import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { Customer } from '../../data-access/models';
import { CustomersStore } from '../../state/customers.store';

@Component({
  selector: 'app-customers-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    ToggleSwitchModule
  ],
  templateUrl: './customers-page.html'
})
export class CustomersPage {
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(CustomersStore);

  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingCustomer = signal<Customer | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email],
    document: [''],
    address: [''],
    notes: ['']
  });

  constructor() {
    this.store.load();
  }

  protected openCreate(): void {
    this.editingCustomer.set(null);
    this.form.reset({ name: '', phone: '', email: '', document: '', address: '', notes: '' });
    this.dialogVisible.set(true);
  }

  protected openEdit(customer: Customer): void {
    this.editingCustomer.set(customer);
    this.form.reset({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      document: customer.document ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? ''
    });
    this.dialogVisible.set(true);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const value = {
        name: raw.name,
        phone: raw.phone || null,
        email: raw.email || null,
        document: raw.document || null,
        address: raw.address || null,
        notes: raw.notes || null
      };
      const editing = this.editingCustomer();
      if (editing) {
        await this.store.update(editing.id, value);
      } else {
        await this.store.create(value);
      }
      this.dialogVisible.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected onToggleActive(id: string, active: boolean): void {
    this.store.setActive(id, active);
  }
}
