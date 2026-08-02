import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

import { primitives, semanticColors } from './design-tokens';

/**
 * Preset de PrimeNG basado en los Design Tokens de VentaRapida (ver design-tokens.ts).
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
      500: primitives.orange500,
      600: primitives.orange600,
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
      950: '#431407'
    },
    colorScheme: {
      dark: {
        primary: {
          color: semanticColors.brand,
          contrastColor: '#ffffff',
          hoverColor: semanticColors.brandHover,
          activeColor: semanticColors.brandHover
        },
        surface: {
          0: semanticColors.textPrimary,
          50: semanticColors.textPrimary,
          100: semanticColors.textSecondary,
          200: semanticColors.border,
          300: semanticColors.bgCardHover,
          400: semanticColors.bgCard,
          500: semanticColors.bgSidebar,
          600: semanticColors.bgCanvas,
          700: '#080d17',
          800: '#05070d',
          900: '#03050a',
          950: '#010204'
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
        }
      }
    }
  },
  components: {
    button: {
      colorScheme: {
        dark: {
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
