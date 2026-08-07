import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

import { primitives, semanticColors } from './design-tokens';

/**
 * Preset de PrimeNG basado en los Design Tokens de VentaRapida (ver design-tokens.ts).
 * La app es clara (ver darkModeSelector en app.config.ts, que no matchea nada a proposito),
 * por eso el foco esta puesto en `colorScheme.light`. El rail de navegacion oscuro se
 * pinta aparte con `sidebarColors`, directo en los templates -- no depende de este preset.
 */
export const VentaRapidaPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: primitives.orange500,
      600: primitives.orange600,
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
      950: '#431407'
    },
    colorScheme: {
      light: {
        primary: {
          color: semanticColors.brand,
          contrastColor: '#ffffff',
          hoverColor: semanticColors.brandHover,
          activeColor: semanticColors.brandHover
        },
        surface: {
          0: semanticColors.bgCard,
          50: semanticColors.bgCard,
          100: semanticColors.bgCardHover,
          200: semanticColors.border,
          300: semanticColors.textSecondary,
          400: semanticColors.textSecondary,
          500: semanticColors.textSecondary,
          600: semanticColors.textPrimary,
          700: semanticColors.textPrimary,
          800: semanticColors.textPrimary,
          900: semanticColors.textPrimary,
          950: semanticColors.textPrimary
        },
        formField: {
          background: semanticColors.bgCard,
          borderColor: semanticColors.border,
          color: semanticColors.textPrimary,
          placeholderColor: semanticColors.textSecondary,
          iconColor: semanticColors.textSecondary
        },
        text: {
          mutedColor: semanticColors.textSecondary,
          hoverMutedColor: semanticColors.textPrimary
        },
        content: {
          background: semanticColors.bgCard,
          hoverBackground: semanticColors.bgCardHover,
          borderColor: semanticColors.border
        },
        overlay: {
          select: { background: semanticColors.bgCard, borderColor: semanticColors.border },
          popover: { background: semanticColors.bgCard, borderColor: semanticColors.border },
          modal: { background: semanticColors.bgCard, borderColor: semanticColors.border }
        },
        // Mask: fondo detras de spinners de carga (tablas) y del backdrop de dialogos.
        // El default de Aura es negro 40% -- acá va un velo claro y calido en vez de oscurecer,
        // con el spinner en naranja de marca en vez de gris generico.
        mask: {
          background: 'rgba(253, 251, 248, 0.85)',
          color: semanticColors.brand
        }
      }
    }
  },
  components: {
    button: {
      colorScheme: {
        light: {
          root: {
            success: { background: semanticColors.success },
            danger: { background: semanticColors.error },
            warn: { background: semanticColors.warning },
            info: { background: semanticColors.info }
          }
        }
      }
    }
  }
});
