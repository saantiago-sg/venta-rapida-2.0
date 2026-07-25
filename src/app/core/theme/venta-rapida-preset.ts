import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * Preset de PrimeNG basado en la paleta de marca de VentaRapida.
 * La app siempre corre en modo oscuro (ver `app-dark` en index.html + darkModeSelector en app.config.ts),
 * por eso el foco está puesto en `colorScheme.dark`.
 */
export const VentaRapidaPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
      950: '#431407'
    },
    colorScheme: {
      dark: {
        primary: {
          color: '#f97316',
          contrastColor: '#ffffff',
          hoverColor: '#ea580c',
          activeColor: '#ea580c'
        },
        surface: {
          0: '#f8fafc',
          50: '#f8fafc',
          100: '#94a3b8',
          200: '#334155',
          300: '#273449',
          400: '#1e293b',
          500: '#111827',
          600: '#0f172a',
          700: '#0b1220',
          800: '#080d17',
          900: '#05070d',
          950: '#020306'
        },
        formField: {
          background: '#1e293b',
          borderColor: '#334155',
          color: '#f8fafc'
        }
      }
    }
  },
  components: {
    button: {
      colorScheme: {
        dark: {
          root: {
            success: { background: '#22c55e' },
            danger: { background: '#ef4444' },
            warn: { background: '#facc15' },
            info: { background: '#0ea5e9' }
          }
        }
      }
    }
  }
});
