import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../auth.service';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const passwordConfirm = group.get('passwordConfirm')?.value;
  return password && passwordConfirm && password !== passwordConfirm ? { passwordMismatch: true } : null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password-page.html'
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // supabase-js procesa el link de recuperacion (detectSessionInUrl) apenas carga la pagina --
  // hay que esperar ese chequeo antes de decidir si mostrar el form o el aviso de link invalido.
  protected readonly checkingSession = signal(true);
  protected readonly hasValidLink = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly showPasswordConfirm = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      passwordConfirm: ['', [Validators.required]]
    },
    { validators: passwordsMatchValidator }
  );

  protected togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  protected togglePasswordConfirmVisibility(): void {
    this.showPasswordConfirm.update((value) => !value);
  }

  constructor() {
    this.authService.hasActiveSession().then((hasSession) => {
      this.hasValidLink.set(hasSession);
      this.checkingSession.set(false);
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const { password } = this.form.getRawValue();
      await this.authService.updatePassword(password);
      this.success.set(true);
      // Se cierra la sesion de recuperacion y se manda a /login en vez de dejarlo logueado
      // directo -- asi no hace falta tocar AuthStore.setSession()/loadSession() desde aca.
      await this.authService.signOut();
      setTimeout(() => this.router.navigateByUrl('/login'), 1800);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      this.loading.set(false);
    }
  }
}
