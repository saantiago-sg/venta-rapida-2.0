// Fuente de verdad de la paleta. Si cambia un color, se actualiza aca primero.
//
// Esta constante la consume directo el preset de PrimeNG (venta-rapida-preset.ts).
// El lado de Tailwind (styles.css) NO puede importar un .ts, asi que sus variables
// CSS se mantienen sincronizadas a mano con estos mismos valores -- no armamos un
// paso de build para generar ese CSS porque la paleta cambia pocas veces al año,
// no lo suficiente como para justificar esa complejidad.

export const primitives = {
  slate950: '#0B1220',
  gray900: '#111827',
  slate850: '#162033',
  slate800: '#1C2A3F',
  slate700: '#27364C',

  slate50: '#F8FAFC',
  slate400: '#94A3B8',

  orange500: '#F97316',
  orange600: '#EA580C',

  green500: '#22C55E',
  red500: '#EF4444',
  yellow400: '#FACC15',
  sky500: '#0EA5E9'
} as const;

export const semanticColors = {
  bgCanvas: primitives.slate950,
  bgSidebar: primitives.gray900,
  bgCard: primitives.slate850,
  bgCardHover: primitives.slate800,
  border: primitives.slate700,

  textPrimary: primitives.slate50,
  textSecondary: primitives.slate400,

  brand: primitives.orange500,
  brandHover: primitives.orange600,

  success: primitives.green500,
  error: primitives.red500,
  warning: primitives.yellow400,
  info: primitives.sky500
} as const;
