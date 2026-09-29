import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12'
};

// Indicador de carga reutilizable. Hereda el color del texto (currentColor), asi que dentro
// de un boton toma el color del boton; afuera, pasarle una clase de color (ej. text-brand).
// OJO: no sirve para la carga inicial de la app -- ahi Angular todavia no arranco; para eso
// esta el splash estatico dentro de <app-root> en index.html.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-spinner',
  host: {
    class: 'inline-flex flex-col items-center justify-center gap-2',
    role: 'status',
    '[attr.aria-label]': 'label() ?? "Cargando"'
  },
  template: `
    <svg [class]="sizeClass()" class="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    @if (label()) {
      <span class="text-sm text-text-secondary">{{ label() }}</span>
    }
  `
})
export class Spinner {
  readonly size = input<SpinnerSize>('md');
  readonly label = input<string>();

  protected readonly sizeClass = computed(() => SIZE_CLASSES[this.size()]);
}
