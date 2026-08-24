import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthStore } from '../../auth.store';
import { AuthService } from '../../auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.html'
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.signIn(email, password);
      // Un Super Admin cae directo en su panel -- no tiene por que tener ningun negocio
      // propio, asi que /dashboard (que asume un negocio activo) no le sirve de entrada.
      const destination = this.authStore.isSuperAdmin() ? '/super-admin' : '/dashboard';
      await this.router.navigateByUrl(destination);
    } catch {
      this.errorMessage.set('Email o contraseña incorrectos.');
    } finally {
      this.loading.set(false);
    }
  }
}
