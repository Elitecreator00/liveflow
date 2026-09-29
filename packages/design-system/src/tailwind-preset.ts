/**
 * LiveFlow Tailwind CSS v3 Preset — Premium Silicon Valley Dark Theme
 *
 * Usage in tailwind.config.ts:
 *   import liveflowPreset from '@liveflow/design-system/tailwind-preset';
 *   export default { presets: [liveflowPreset], ... }
 */

import type { Config } from "tailwindcss";

const preset: Omit<Config, "content"> = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ── Semantic surface colors ──────────────────────────────
        bg: {
          base:      "var(--lf-bg-base)",
          surface:   "var(--lf-bg-surface)",
          elevated:  "var(--lf-bg-elevated)",
          subtle:    "var(--lf-bg-subtle)",
          overlay:   "var(--lf-bg-overlay)",
          glass:     "var(--lf-bg-glass)",
        },

        // ── Border ──────────────────────────────────────────────
        border: {
          faint:   "var(--lf-border-faint)",
          DEFAULT: "var(--lf-border-default)",
          strong:  "var(--lf-border-strong)",
          focus:   "var(--lf-border-focus)",
          glass:   "var(--lf-border-glass)",
        },

        // ── Text ────────────────────────────────────────────────
        text: {
          primary:   "var(--lf-text-primary)",
          secondary: "var(--lf-text-secondary)",
          muted:     "var(--lf-text-muted)",
          disabled:  "var(--lf-text-disabled)",
          inverse:   "var(--lf-text-inverse)",
        },

        // ── Primary (Violet) ─────────────────────────────────────
        primary: {
          DEFAULT: "var(--lf-primary)",
          hover:   "var(--lf-primary-hover)",
          active:  "var(--lf-primary-active)",
          muted:   "var(--lf-primary-muted)",
          fg:      "var(--lf-primary-fg)",
        },

        // ── Accent (Cyan) ────────────────────────────────────────
        accent: {
          DEFAULT: "var(--lf-accent)",
          hover:   "var(--lf-accent-hover)",
          active:  "var(--lf-accent-active)",
          muted:   "var(--lf-accent-muted)",
          fg:      "var(--lf-accent-fg)",
        },

        // ── Status ───────────────────────────────────────────────
        success: {
          DEFAULT: "var(--lf-success)",
          muted:   "var(--lf-success-muted)",
          fg:      "var(--lf-success-fg)",
        },
        warn: {
          DEFAULT: "var(--lf-warn)",
          muted:   "var(--lf-warn-muted)",
          fg:      "var(--lf-warn-fg)",
        },
        danger: {
          DEFAULT: "var(--lf-danger)",
          muted:   "var(--lf-danger-muted)",
          fg:      "var(--lf-danger-fg)",
        },

        // ── Signal ───────────────────────────────────────────────
        live:    "var(--lf-live)",
        offline: "var(--lf-offline)",

        // ── Primitive violet palette ─────────────────────────────
        violet: {
          50:  "#f5effe",
          100: "#ead5fe",
          200: "#ccaaf8",
          300: "#aa7ef2",
          400: "#8b58e8",
          500: "#6d35d4",
          600: "#5228b0",
          700: "#3c1a88",
          800: "#2a1060",
          900: "#180832",
          950: "#0c0418",
        },

        // ── Primitive cyan palette ───────────────────────────────
        cyan: {
          50:  "#e6fcff",
          100: "#c0f4fe",
          200: "#80e8f8",
          300: "#3dd4f0",
          400: "#18c0e0",
          500: "#1090b0",
          600: "#0a6e8a",
          700: "#064d65",
          800: "#033040",
          900: "#011e28",
        },

        // ── Neutral (cool blue-gray) ─────────────────────────────
        neutral: {
          50:  "#e8edf7",
          100: "#cdd6e8",
          200: "#a8b6cc",
          300: "#7a8ba6",
          400: "#536076",
          500: "#384059",
          600: "#273047",
          700: "#1d2436",
          750: "#161c2a",
          800: "#111520",
          850: "#0d1018",
          900: "#090b12",
          950: "#05060b",
        },
      },

      // ── Font families ────────────────────────────────────────────
      fontFamily: {
        sans:    ["var(--lf-font-sans)", "system-ui", "sans-serif"],
        mono:    ["var(--lf-font-mono)", "monospace"],
        display: ["var(--lf-font-display)", "system-ui", "sans-serif"],
      },

      // ── Font sizes ───────────────────────────────────────────────
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.06em" }],
        xs:    ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
        sm:    ["12px", { lineHeight: "18px", letterSpacing: "0.02em" }],
        base:  ["14px", { lineHeight: "22px" }],
        md:    ["15px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        lg:    ["16px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
        xl:    ["18px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "2xl": ["21px", { lineHeight: "30px", letterSpacing: "-0.02em" }],
        "3xl": ["24px", { lineHeight: "34px", letterSpacing: "-0.025em" }],
        "4xl": ["30px", { lineHeight: "40px", letterSpacing: "-0.03em" }],
        "5xl": ["38px", { lineHeight: "46px", letterSpacing: "-0.035em" }],
        "6xl": ["50px", { lineHeight: "58px", letterSpacing: "-0.04em" }],
      },

      // ── Border radii ─────────────────────────────────────────────
      borderRadius: {
        xs:    "3px",
        sm:    "5px",
        md:    "8px",
        lg:    "10px",
        xl:    "14px",
        "2xl": "18px",
        "3xl": "24px",
        "4xl": "32px",
        full:  "9999px",
      },

      // ── Box shadows / glow ───────────────────────────────────────
      boxShadow: {
        xs:              "0 1px 2px 0 rgba(0,0,0,0.6)",
        sm:              "0 2px 6px 0 rgba(0,0,0,0.65), 0 1px 2px 0 rgba(0,0,0,0.4)",
        md:              "0 4px 16px 0 rgba(0,0,0,0.7), 0 2px 4px 0 rgba(0,0,0,0.5)",
        lg:              "0 8px 32px 0 rgba(0,0,0,0.8), 0 4px 8px 0 rgba(0,0,0,0.5)",
        xl:              "0 16px 56px 0 rgba(0,0,0,0.9), 0 8px 16px 0 rgba(0,0,0,0.6)",
        "2xl":           "0 24px 72px 0 rgba(0,0,0,0.95), 0 12px 24px 0 rgba(0,0,0,0.7)",
        glass:           "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
        "inset-highlight":"inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.2)",
        inset:           "inset 0 1px 0 rgba(255,255,255,0.05)",
        "glow-primary":  "0 0 20px 3px rgba(109,53,212,0.45), 0 0 6px 0 rgba(109,53,212,0.7)",
        "glow-primary-sm":"0 0 10px 2px rgba(109,53,212,0.35), 0 0 3px 0 rgba(109,53,212,0.6)",
        "glow-accent":   "0 0 20px 3px rgba(24,192,224,0.35), 0 0 6px 0 rgba(24,192,224,0.6)",
        "glow-accent-sm":"0 0 10px 2px rgba(24,192,224,0.3), 0 0 3px 0 rgba(24,192,224,0.5)",
        "glow-success":  "0 0 14px 2px rgba(52,211,153,0.35), 0 0 4px 0 rgba(52,211,153,0.5)",
        "glow-danger":   "0 0 14px 2px rgba(248,113,113,0.45), 0 0 4px 0 rgba(248,113,113,0.6)",
        "glow-brand":    "0 0 30px 6px rgba(124,58,237,0.3), 0 0 60px 12px rgba(24,192,224,0.15)",
      },

      // ── Background images (gradients) ────────────────────────────
      backgroundImage: {
        "gradient-brand":    "linear-gradient(135deg, #7c3aed 0%, #18c0e0 100%)",
        "gradient-primary":  "linear-gradient(135deg, #7c3aed 0%, #4f1fb8 100%)",
        "gradient-accent":   "linear-gradient(135deg, #18c0e0 0%, #0a6e8a 100%)",
        "gradient-surface":  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)",
        "gradient-glow":     "radial-gradient(ellipse at top, rgba(109,53,212,0.15) 0%, transparent 70%)",
        "gradient-dark":     "linear-gradient(180deg, rgba(5,6,11,0) 0%, rgba(5,6,11,0.95) 100%)",
        "gradient-card-top": "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 60%)",
        "shimmer":           "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
      },

      // ── Transition durations ─────────────────────────────────────
      transitionDuration: {
        fast:    "100ms",
        normal:  "180ms",
        slow:    "300ms",
        slower:  "500ms",
        slowest: "700ms",
      },

      // ── Transition timing functions ──────────────────────────────
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        snappy: "cubic-bezier(0.2, 0, 0, 1)",
        smooth: "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },

      // ── Keyframe animations ──────────────────────────────────────
      keyframes: {
        "lf-pulse-live": {
          "0%, 100%": { opacity: "1",    boxShadow: "0 0 0 0   rgba(248,113,113,0.7)" },
          "50%":       { opacity: "0.85", boxShadow: "0 0 0 7px rgba(248,113,113,0)" },
        },
        "lf-spin": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
        "lf-fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "lf-fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "lf-slide-in-left": {
          from: { opacity: "0", transform: "translateX(-10px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "lf-slide-in-right": {
          from: { opacity: "0", transform: "translateX(10px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "lf-scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "lf-glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px 3px rgba(24,192,224,0.35), 0 0 6px 0 rgba(24,192,224,0.6)" },
          "50%":       { boxShadow: "none" },
        },
        "lf-brand-glow": {
          "0%, 100%": { boxShadow: "0 0 20px 3px rgba(109,53,212,0.45), 0 0 6px 0 rgba(109,53,212,0.7)" },
          "50%":       { boxShadow: "0 0 40px 8px rgba(109,53,212,0.6), 0 0 80px 16px rgba(24,192,224,0.2)" },
        },
        "lf-shimmer": {
          from: { backgroundPosition: "-200% center" },
          to:   { backgroundPosition: "200% center" },
        },
        "lf-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":       { transform: "translateY(-4px)" },
        },
      },

      animation: {
        "pulse-live":      "lf-pulse-live 1.8s ease-in-out infinite",
        "spin-lf":         "lf-spin 0.9s linear infinite",
        "fade-in":         "lf-fade-in 180ms cubic-bezier(0.4,0,0.2,1) both",
        "fade-in-up":      "lf-fade-in-up 300ms cubic-bezier(0.4,0,0.2,1) both",
        "slide-in-left":   "lf-slide-in-left 180ms cubic-bezier(0.4,0,0.2,1) both",
        "slide-in-right":  "lf-slide-in-right 180ms cubic-bezier(0.4,0,0.2,1) both",
        "scale-in":        "lf-scale-in 180ms cubic-bezier(0.34,1.56,0.64,1) both",
        "glow-pulse":      "lf-glow-pulse 3s ease-in-out infinite",
        "brand-glow":      "lf-brand-glow 3s ease-in-out infinite",
        "shimmer":         "lf-shimmer 2s linear infinite",
        "float":           "lf-float 3s ease-in-out infinite",
      },

      // ── Backdrop blur ────────────────────────────────────────────
      backdropBlur: {
        xs:    "2px",
        sm:    "6px",
        md:    "12px",
        lg:    "20px",
        xl:    "32px",
        glass: "16px",
      },

      // ── Spacing extras ───────────────────────────────────────────
      spacing: {
        "4.5": "18px",
        "13":  "52px",
        "15":  "60px",
        "18":  "72px",
        "22":  "88px",
      },
    },
  },
};

export default preset;
