import { Directive, ElementRef, effect, inject, input } from '@angular/core';

// Anima el numero mostrado desde el valor anterior hasta el nuevo en vez de que aparezca
// de golpe -- detalle de pulido en KPIs (Dashboard, Reportes). Formatea a mano en vez de
// depender de DecimalPipe porque necesita re-formatear en cada frame de la animacion.
@Directive({
  selector: '[appCountUp]',
  standalone: true
})
export class CountUpDirective {
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;

  readonly appCountUp = input<number>(0);
  readonly decimals = input(2);

  private previous = 0;
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      const decimals = this.decimals();
      this.animate(this.previous, target, decimals);
      this.previous = target;
    });
  }

  private animate(from: number, to: number, decimals: number): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);

    if (from === to) {
      this.el.textContent = this.format(to, decimals);
      return;
    }

    const duration = 700;
    const start = performance.now();
    const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const value = from + (to - from) * easeOutExpo(t);
      this.el.textContent = this.format(value, decimals);

      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = null;
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private format(value: number, decimals: number): string {
    return value.toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
}
