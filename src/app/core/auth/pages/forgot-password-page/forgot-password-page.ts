import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password-page.html'
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(false);
  // No se distingue "se mando" de "el email no existe" -- una vez enviado el pedido, el
  // resultado en pantalla es siempre el mismo, exista o no la cuenta (ver AuthService).
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      const { email } = this.form.getRawValue();
      await this.authService.requestPasswordReset(email);
    } catch {
      // Ignorado a proposito: ni un error de red/rate-limit cambia el mensaje final.
    } finally {
      this.loading.set(false);
      this.submitted.set(true);
    }
  }
}
