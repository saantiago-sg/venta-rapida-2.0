import { Injectable, signal } from '@angular/core';

// Por debajo de esto la diferencia de alto son barras del navegador que aparecen y
// desaparecen, no un teclado (el teclado en pantalla mas chico ronda los 250px).
const KEYBOARD_MIN_HEIGHT_PX = 150;

// Safari en iOS (y Chrome Android por defecto) no achica la pagina al abrir el teclado: lo
// dibuja encima. Como el Shell mide el alto completo de la pantalla, las listas con scroll
// interno (ej. resultados del buscador del POS) quedaban tapadas por el teclado. visualViewport
// si refleja el alto realmente visible: con el teclado abierto se publica en --app-height y el
// Shell toma ese alto (ver shell.html), asi todo termina justo arriba del teclado.
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly _keyboardOpen = signal(false);
  readonly keyboardOpen = this._keyboardOpen.asReadonly();

  constructor() {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      // * scale: con zoom de pellizco el alto visible tambien baja, pero eso no es el teclado.
      const open = window.innerHeight - viewport.height * viewport.scale > KEYBOARD_MIN_HEIGHT_PX;
      this._keyboardOpen.set(open);

      const root = document.documentElement;
      if (open) {
        root.style.setProperty('--app-height', `${viewport.height}px`);
        // iOS ademas scrollea la pagina para acercar el input; con el Shell ya del alto visible
        // ese scroll solo deja la app corrida hacia arriba, cortada.
        if (window.scrollY !== 0 || viewport.offsetTop !== 0) window.scrollTo(0, 0);
      } else {
        root.style.removeProperty('--app-height');
      }
    };

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
  }
}
