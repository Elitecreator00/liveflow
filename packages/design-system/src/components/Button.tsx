import React from "react";

export type ButtonVariant = "primary" | "accent" | "ghost" | "danger" | "outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-primary text-primary-fg border border-violet-600/40 " +
    "shadow-sm hover:shadow-glow-primary-sm hover:brightness-110 " +
    "active:brightness-90 active:shadow-none " +
    "focus-visible:shadow-glow-primary",
  accent:
    "bg-gradient-accent text-accent-fg border border-cyan-600/40 " +
    "shadow-sm hover:shadow-glow-accent-sm hover:brightness-110 " +
    "active:brightness-90 active:shadow-none " +
    "focus-visible:shadow-glow-accent",
  ghost:
    "bg-transparent text-text-secondary border border-border/60 " +
    "hover:bg-bg-overlay hover:text-text-primary hover:border-border " +
    "active:bg-bg-subtle",
  danger:
    "bg-danger-muted/80 text-danger border border-danger/20 " +
    "hover:bg-danger hover:text-danger-fg hover:border-danger " +
    "hover:shadow-glow-danger active:brightness-90",
  outline:
    "bg-transparent text-text-primary border border-border " +
    "hover:border-border-strong hover:bg-bg-overlay " +
    "active:bg-bg-subtle",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-6 px-2.5 text-xs rounded-sm gap-1 font-medium",
  sm: "h-7 px-3 text-sm rounded-md gap-1.5 font-medium",
  md: "h-9 px-4 text-base rounded-lg gap-2 font-semibold",
  lg: "h-11 px-6 text-lg rounded-xl gap-2.5 font-semibold",
};

/**
 * Button
 * Premium interactive element. Supports primary, accent, ghost, danger, outline variants.
 * Prop API is stable — variant/size/loading/leftIcon/rightIcon/fullWidth.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      className={[
        "inline-flex items-center justify-center",
        "transition-all duration-normal ease-[cubic-bezier(0.4,0,0.2,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        "select-none cursor-pointer whitespace-nowrap",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        "active:scale-[0.98]",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block w-[1em] h-[1em] rounded-full border-2
            border-current border-t-transparent animate-spin-lf flex-shrink-0"
          role="status"
          aria-label="Loading"
        />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && rightIcon && (
        <span className="flex-shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}
