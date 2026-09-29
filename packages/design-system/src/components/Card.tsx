import React from "react";

export type CardVariant = "default" | "elevated" | "outlined" | "ghost";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  glow?: "none" | "primary" | "accent";
  as?: React.ElementType;
}

const variantClasses: Record<CardVariant, string> = {
  default:
    "bg-bg-surface border border-border shadow-md " +
    "bg-gradient-card-top",
  elevated:
    "bg-bg-elevated border border-border-strong shadow-lg " +
    "bg-gradient-card-top",
  outlined:
    "bg-transparent border border-border",
  ghost:
    "bg-bg-subtle/50 border border-transparent",
};

const paddingClasses = {
  none: "",
  sm:   "p-3",
  md:   "p-5",
  lg:   "p-7",
};

const glowClasses = {
  none:    "",
  primary: "shadow-glow-primary-sm border-violet-600/30",
  accent:  "shadow-glow-accent-sm border-cyan-600/25",
};

/**
 * Card
 * Premium container surface. Foundation for panels, tiles, modals.
 * Prop API: variant / padding / glow / as (element type).
 */
export function Card({
  variant = "default",
  padding = "md",
  glow = "none",
  as: Tag = "div",
  className,
  children,
  ...props
}: CardProps): React.ReactElement {
  return (
    <Tag
      className={[
        "rounded-xl overflow-hidden",
        "transition-shadow duration-normal",
        variantClasses[variant],
        paddingClasses[padding],
        glowClasses[glow],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </Tag>
  );
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: CardHeaderProps): React.ReactElement {
  return (
    <div
      className={[
        "flex items-start justify-between gap-3 mb-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <div className="flex-1 min-w-0">
        {title && (
          <h3 className="text-lg font-semibold text-text-primary leading-snug truncate tracking-tight">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-text-secondary mt-1">{description}</p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
