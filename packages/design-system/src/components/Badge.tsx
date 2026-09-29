import React from "react";

export type BadgeVariant =
  | "default"
  | "primary"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-bg-overlay/80 text-text-secondary border border-border/60",
  primary: "bg-primary-muted/80 text-primary-hover border border-violet-600/25",
  accent:  "bg-accent-muted/80 text-accent border border-cyan-600/25",
  success: "bg-success-muted/80 text-success border border-success/20",
  warn:    "bg-warn-muted/80 text-warn border border-warn/20",
  danger:  "bg-danger-muted/80 text-danger border border-danger/20",
  outline: "bg-transparent text-text-primary border border-border-strong",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "text-2xs px-1.5 py-0.5 rounded-sm",
  md: "text-xs  px-2   py-0.5 rounded-md",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-text-muted",
  primary: "bg-primary",
  accent:  "bg-accent",
  success: "bg-success",
  warn:    "bg-warn",
  danger:  "bg-danger",
  outline: "bg-text-secondary",
};

/**
 * Badge
 * Compact status label. Use for categories, counts, status tags.
 * Prop API: variant / size / dot.
 */
export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 font-medium whitespace-nowrap",
        "transition-colors duration-fast",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {dot && (
        <span
          className={[
            "inline-block rounded-full flex-shrink-0",
            size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5",
            dotColors[variant],
          ].join(" ")}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
