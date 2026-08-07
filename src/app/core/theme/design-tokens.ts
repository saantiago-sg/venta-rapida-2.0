// Fuente de verdad de la paleta. Si cambia un color, se actualiza aca primero.
//
// Esta constante la consume directo el preset de PrimeNG (venta-rapida-preset.ts).
// El lado de Tailwind (styles.css) NO puede importar un .ts, asi que sus variables
// CSS se mantienen sincronizadas a mano con estos mismos valores -- no armamos un
// paso de build para generar ese CSS porque la paleta cambia pocas veces al año,
// no lo suficiente como para justificar esa complejidad.
//
// La app en general es clara (semanticColors). El rail de navegacion (sidebar) es la
// unica excepcion deliberada -- se mantiene oscuro como acento de marca, por eso tiene
// su propio set de tokens (sidebarColors) en vez de compartir los de contenido.

export const primitives = {
  cream50: '#FDFBF8',
  cream100: '#F5F1EC',
  cream200: '#E7DFD3',

  warmGray900: '#241E18',
  warmGray600: '#8A7F73',

  stone950: '#14100D',
  stone900: '#1C1713',
  stone800: '#2D2620',
  stone700: '#3D332B',
  stone50: '#FAF6F1',
  stone400: '#A89A8C',

  orange500: '#F97316',
  orange600: '#EA580C',

  green600: '#16A34A',
  red600: '#DC2626',
  amber600: '#D97706',
  sky600: '#0284C7'
} as const;

export const semanticColors = {
  bgCanvas: primitives.cream50,
  bgCard: '#FFFFFF',
  bgCardHover: primitives.cream100,
  border: primitives.cream200,

  textPrimary: primitives.warmGray900,
  textSecondary: primitives.warmGray600,

  brand: primitives.orange500,
  brandHover: primitives.orange600,

  success: primitives.green600,
  error: primitives.red600,
  warning: primitives.amber600,
  info: primitives.sky600
} as const;

// Rail de navegacion: siempre oscuro, independiente del tema claro de arriba.
export const sidebarColors = {
  bg: primitives.stone900,
  bgActive: primitives.stone800,
  border: primitives.stone700,
  text: primitives.stone50,
  textSecondary: primitives.stone400
} as const;
