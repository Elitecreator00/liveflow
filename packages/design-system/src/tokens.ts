/**
 * LiveFlow Design Tokens
 * Premium Silicon Valley dark theme — elevated control-room aesthetic
 */

// ─── Color Palette ───────────────────────────────────────────────────────────

export const colorPrimitive = {
  // Neutral / base — near-black with subtle blue-violet undertone
  neutral950: "#05060b",
  neutral900: "#090b12",
  neutral850: "#0d1018",
  neutral800: "#111520",
  neutral750: "#161c2a",
  neutral700: "#1d2436",
  neutral600: "#273047",
  neutral500: "#384059",
  neutral400: "#536076",
  neutral300: "#7a8ba6",
  neutral200: "#a8b6cc",
  neutral100: "#cdd6e8",
  neutral50:  "#e8edf7",
  white:      "#ffffff",

  // Violet / Primary (LiveFlow signature — premium depth)
  violet950: "#0c0418",
  violet900: "#180832",
  violet800: "#2a1060",
  violet700: "#3c1a88",
  violet600: "#5228b0",
  violet500: "#6d35d4",
  violet400: "#8b58e8",
  violet300: "#aa7ef2",
  violet200: "#ccaaf8",
  violet100: "#ead5fe",
  violet50:  "#f5effe",

  // Cyan / Accent (signal / live indicator — refined)
  cyan900: "#011e28",
  cyan800: "#033040",
  cyan700: "#064d65",
  cyan600: "#0a6e8a",
  cyan500: "#1090b0",
  cyan400: "#18c0e0",
  cyan300: "#3dd4f0",
  cyan200: "#80e8f8",
  cyan100: "#c0f4fe",
  cyan50:  "#e6fcff",

  // Brand gradient stops
  gradientVioletStart: "#7c3aed",
  gradientVioletEnd:   "#4f1fb8",
  gradientCyanStart:   "#18c0e0",
  gradientCyanEnd:     "#0a6e8a",

  // Semantic status
  emerald800: "#044027",
  emerald700: "#065534",
  emerald600: "#0a7a4e",
  emerald500: "#10b77a",
  emerald400: "#34d399",
  emerald300: "#6ee7b7",

  amber800: "#5c2800",
  amber700: "#78350f",
  amber500: "#d97706",
  amber400: "#fbbf24",
  amber300: "#fcd34d",

  red800:   "#5a1010",
  red700:   "#7f1d1d",
  red500:   "#ef4444",
  red400:   "#f87171",
  red300:   "#fca5a5",
} as const;

// ─── Semantic Color Tokens ────────────────────────────────────────────────────

export const colorSemantic = {
  // Backgrounds — layered depth (darker = deeper)
  bgBase:      colorPrimitive.neutral950,   // #05060b — page canvas
  bgSurface:   colorPrimitive.neutral900,   // #090b12 — cards, panels
  bgElevated:  colorPrimitive.neutral850,   // #0d1018 — modals, dropdowns
  bgSubtle:    colorPrimitive.neutral800,   // #111520 — subtle sections
  bgOverlay:   colorPrimitive.neutral750,   // #161c2a — hover/active states
  bgGlass:     "rgba(9, 11, 18, 0.75)",     // glassmorphism surface
  bgGlassLight:"rgba(255, 255, 255, 0.04)", // glass highlight layer

  // Borders
  borderFaint:   colorPrimitive.neutral700, // #1d2436
  borderDefault: colorPrimitive.neutral600, // #273047
  borderStrong:  colorPrimitive.neutral500, // #384059
  borderFocus:   colorPrimitive.violet400,  // #8b58e8
  borderGlass:   "rgba(255, 255, 255, 0.08)", // glass border

  // Text
  textPrimary:   colorPrimitive.neutral100, // #cdd6e8
  textSecondary: colorPrimitive.neutral300, // #7a8ba6
  textMuted:     colorPrimitive.neutral400, // #536076
  textDisabled:  colorPrimitive.neutral500, // #384059
  textInverse:   colorPrimitive.neutral950, // #05060b

  // Primary — Violet
  primaryDefault: colorPrimitive.violet500, // #6d35d4
  primaryHover:   colorPrimitive.violet400, // #8b58e8
  primaryActive:  colorPrimitive.violet600, // #5228b0
  primaryMuted:   colorPrimitive.violet900, // #180832
  primaryFg:      colorPrimitive.white,

  // Accent — Cyan
  accentDefault: colorPrimitive.cyan400,    // #18c0e0
  accentHover:   colorPrimitive.cyan300,    // #3dd4f0
  accentActive:  colorPrimitive.cyan500,    // #1090b0
  accentMuted:   colorPrimitive.cyan900,    // #011e28
  accentFg:      colorPrimitive.neutral950,

  // Status — Success
  successDefault: colorPrimitive.emerald400,
  successMuted:   colorPrimitive.emerald800,
  successFg:      colorPrimitive.neutral950,

  // Status — Warning
  warnDefault: colorPrimitive.amber400,
  warnMuted:   colorPrimitive.amber800,
  warnFg:      colorPrimitive.neutral950,

  // Status — Danger
  dangerDefault: colorPrimitive.red400,
  dangerMuted:   colorPrimitive.red800,
  dangerFg:      colorPrimitive.neutral950,

  // Live signal
  liveSignal:    colorPrimitive.red400,
  offlineSignal: colorPrimitive.neutral500,
  warnSignal:    colorPrimitive.amber400,

  // Brand gradients (CSS gradient strings)
  gradientBrand:   "linear-gradient(135deg, #7c3aed 0%, #18c0e0 100%)",
  gradientPrimary: "linear-gradient(135deg, #7c3aed 0%, #4f1fb8 100%)",
  gradientAccent:  "linear-gradient(135deg, #18c0e0 0%, #0a6e8a 100%)",
  gradientSurface: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)",
  gradientGlow:    "radial-gradient(ellipse at top, rgba(109,53,212,0.15) 0%, transparent 70%)",
} as const;

// ─── Spacing Scale ────────────────────────────────────────────────────────────

export const spacing = {
  0:   "0px",
  px:  "1px",
  0.5: "2px",
  1:   "4px",
  1.5: "6px",
  2:   "8px",
  2.5: "10px",
  3:   "12px",
  3.5: "14px",
  4:   "16px",
  5:   "20px",
  6:   "24px",
  7:   "28px",
  8:   "32px",
  10:  "40px",
  12:  "48px",
  14:  "56px",
  16:  "64px",
  20:  "80px",
  24:  "96px",
  32:  "128px",
  40:  "160px",
  48:  "192px",
  56:  "224px",
  64:  "256px",
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const radii = {
  none:  "0px",
  xs:    "3px",
  sm:    "5px",
  md:    "8px",
  lg:    "10px",
  xl:    "14px",
  "2xl": "18px",
  "3xl": "24px",
  "4xl": "32px",
  full:  "9999px",
} as const;

// ─── Shadow / Glow ────────────────────────────────────────────────────────────

export const shadows = {
  none:           "none",
  xs:             "0 1px 2px 0 rgba(0,0,0,0.6)",
  sm:             "0 2px 6px 0 rgba(0,0,0,0.65), 0 1px 2px 0 rgba(0,0,0,0.4)",
  md:             "0 4px 16px 0 rgba(0,0,0,0.7), 0 2px 4px 0 rgba(0,0,0,0.5)",
  lg:             "0 8px 32px 0 rgba(0,0,0,0.8), 0 4px 8px 0 rgba(0,0,0,0.5)",
  xl:             "0 16px 56px 0 rgba(0,0,0,0.9), 0 8px 16px 0 rgba(0,0,0,0.6)",
  "2xl":          "0 24px 72px 0 rgba(0,0,0,0.95), 0 12px 24px 0 rgba(0,0,0,0.7)",
  glowViolet:     "0 0 20px 3px rgba(109,53,212,0.45), 0 0 6px 0 rgba(109,53,212,0.7), 0 0 1px 0 rgba(139,88,232,0.9)",
  glowVioletSm:   "0 0 10px 2px rgba(109,53,212,0.35), 0 0 3px 0 rgba(109,53,212,0.6)",
  glowCyan:       "0 0 20px 3px rgba(24,192,224,0.35), 0 0 6px 0 rgba(24,192,224,0.6), 0 0 1px 0 rgba(61,212,240,0.8)",
  glowCyanSm:     "0 0 10px 2px rgba(24,192,224,0.3), 0 0 3px 0 rgba(24,192,224,0.5)",
  glowSuccess:    "0 0 14px 2px rgba(52,211,153,0.35), 0 0 4px 0 rgba(52,211,153,0.5)",
  glowDanger:     "0 0 14px 2px rgba(248,113,113,0.45), 0 0 4px 0 rgba(248,113,113,0.6)",
  glowBrand:      "0 0 30px 6px rgba(124,58,237,0.3), 0 0 60px 12px rgba(24,192,224,0.15)",
  insetHighlight: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.2)",
  inset:          "inset 0 1px 0 rgba(255,255,255,0.05)",
  glass:          "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

export const fontFamily = {
  sans:    "'Inter var', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
  display: "'Inter var', 'Inter', system-ui, sans-serif",
} as const;

export const fontSize = {
  "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.06em" }],
  xs:    ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
  sm:    ["12px", { lineHeight: "18px", letterSpacing: "0.02em" }],
  base:  ["14px", { lineHeight: "22px", letterSpacing: "0em" }],
  md:    ["15px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
  lg:    ["16px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
  xl:    ["18px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
  "2xl": ["21px", { lineHeight: "30px", letterSpacing: "-0.02em" }],
  "3xl": ["24px", { lineHeight: "34px", letterSpacing: "-0.025em" }],
  "4xl": ["30px", { lineHeight: "40px", letterSpacing: "-0.03em" }],
  "5xl": ["38px", { lineHeight: "46px", letterSpacing: "-0.035em" }],
  "6xl": ["50px", { lineHeight: "58px", letterSpacing: "-0.04em" }],
} as const;

export const fontWeight = {
  light:     "300",
  normal:    "400",
  medium:    "500",
  semibold:  "600",
  bold:      "700",
  extrabold: "800",
} as const;

// ─── Animation ────────────────────────────────────────────────────────────────

export const duration = {
  instant: "0ms",
  fast:    "100ms",
  normal:  "180ms",
  slow:    "300ms",
  slower:  "500ms",
  slowest: "700ms",
} as const;

export const easing = {
  linear:   "linear",
  ease:     "cubic-bezier(0.4, 0, 0.2, 1)",
  easeIn:   "cubic-bezier(0.4, 0, 1, 1)",
  easeOut:  "cubic-bezier(0, 0, 0.2, 1)",
  spring:   "cubic-bezier(0.34, 1.56, 0.64, 1)",
  snappy:   "cubic-bezier(0.2, 0, 0, 1)",
  smooth:   "cubic-bezier(0.25, 0.1, 0.25, 1)",
} as const;

// ─── Z-Index ──────────────────────────────────────────────────────────────────

export const zIndex = {
  base:    0,
  raised:  10,
  overlay: 100,
  modal:   200,
  popover: 300,
  toast:   400,
  tooltip: 500,
} as const;

// ─── Breakpoints ──────────────────────────────────────────────────────────────

export const screens = {
  sm:    "640px",
  md:    "768px",
  lg:    "1024px",
  xl:    "1280px",
  "2xl": "1536px",
} as const;

// ─── Blur ─────────────────────────────────────────────────────────────────────

export const blur = {
  none: "0px",
  xs:   "2px",
  sm:   "6px",
  md:   "12px",
  lg:   "20px",
  xl:   "32px",
  "2xl":"48px",
  glass:"16px",
} as const;

// ─── Token bundle ─────────────────────────────────────────────────────────────

export const tokens = {
  color: { primitive: colorPrimitive, semantic: colorSemantic },
  spacing,
  radii,
  shadows,
  fontFamily,
  fontSize,
  fontWeight,
  duration,
  easing,
  zIndex,
  screens,
  blur,
} as const;

export type Tokens = typeof tokens;
export type ColorPrimitive = typeof colorPrimitive;
export type ColorSemantic = typeof colorSemantic;
