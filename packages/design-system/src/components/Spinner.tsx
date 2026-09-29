import React from "react";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
export type SpinnerVariant = "primary" | "accent" | "muted";

export interface SpinnerProps extends React.SVGAttributes<SVGElement> {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  label?: string;
}

const sizeMap: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 40,
};

const variantClasses: Record<SpinnerVariant, string> = {
  primary: "text-primary",
  accent:  "text-accent",
  muted:   "text-text-muted",
};

/**
 * Spinner
 * Animated loading indicator. SVG-based for crisp rendering at all sizes.
 */
export function Spinner({
  size = "md",
  variant = "primary",
  label = "Loading…",
  className,
  ...props
}: SpinnerProps): React.ReactElement {
  const px = sizeMap[size];
  const stroke = size === "xs" || size === "sm" ? 2.5 : 2;

  return (
    <svg
      role="status"
      aria-label={label}
      width={px}
      height={px}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={[
        "animate-spin-lf flex-shrink-0",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {/* Track */}
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeOpacity="0.2"
      />
      {/* Arc */}
      <path
        d="M10 2a8 8 0 0 1 8 8"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
