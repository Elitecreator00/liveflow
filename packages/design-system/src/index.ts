/**
 * @liveflow/design-system
 * Dark Control-Room design system for LiveFlow.
 *
 * Usage:
 *   import { Button, Card, ThemeProvider } from '@liveflow/design-system';
 *   import '@liveflow/design-system/tokens.css';
 *
 *   // tailwind.config.ts
 *   import preset from '@liveflow/design-system/tailwind-preset';
 *   export default { presets: [preset], content: [...] };
 */

// Components
export * from "./components/index.js";

// Tokens
export {
  tokens,
  colorPrimitive,
  colorSemantic,
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
} from "./tokens.js";

export type { Tokens, ColorPrimitive, ColorSemantic } from "./tokens.js";
