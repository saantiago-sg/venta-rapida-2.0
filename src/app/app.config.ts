import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { SyncService } from './core/offline/sync.service';
import { VentaRapidaPreset } from './core/theme/venta-rapida-preset';

registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-AR' },
    provideBrowserGlobalErrorListeners(),
    // Sin zone.js: todo el estado de pantalla vive en signals y todos los componentes son
    // OnPush, asi que Angular ya sabe cuando redibujar sin parchear cada setTimeout/fetch/evento
    // del navegador. Son ~35 kB menos en el arranque y menos chequeos de cambios en cada evento.
    // Ojo al agregar codigo: un campo comun (no signal) que cambie despues de un await o un
    // setTimeout NO se refleja en pantalla -- usar signal().
    provideZonelessChangeDetection(),
    // Las pantallas son lazy (bundle inicial chico), pero sin precarga la primera entrada a
    // cada una esperaba la descarga de su chunk. Asi se bajan en segundo plano apenas arranca.
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAnimationsAsync(),
    // Restaura la sesion (si existe) antes de que el router evalue los guards de la ruta inicial.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    // Instancia el sincronizador de ventas offline apenas arranca la app -- queda corriendo
    // en segundo plano toda la sesion, sin depender de que el cajero este en la pantalla de
    // Vender (ver SyncService).
    provideAppInitializer(() => void inject(SyncService)),
    providePrimeNG({
      theme: {
        preset: VentaRapidaPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities'
          }
        }
      },
      // Los componentes de PrimeNG (calendario, etc.) no siguen el LOCALE_ID de Angular --
      // tienen su propia config de idioma, por eso se fija acá aparte.
      translation: {
        dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
        dayNamesShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
        dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
        monthNames: [
          'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
          'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
        ],
        monthNamesShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
        dateFormat: 'dd/mm/yy',
        firstDayOfWeek: 1,
        today: 'Hoy',
        clear: 'Limpiar',
        weekHeader: 'Sem',
        choose: 'Elegir',
        upload: 'Subir',
        cancel: 'Cancelar',
        accept: 'Sí',
        reject: 'No',
        emptyMessage: 'No hay opciones',
        emptyFilterMessage: 'No se encontraron resultados',
        emptySearchMessage: 'No se encontraron resultados',
        emptySelectionMessage: 'No hay elementos seleccionados',
        noFilter: 'Sin filtro'
      }
    })
  ]
};
