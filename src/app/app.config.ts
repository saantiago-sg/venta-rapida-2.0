import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
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
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
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
