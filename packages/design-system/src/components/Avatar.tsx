import React from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: AvatarSize;
  /** Ring color variant */
  ring?: "none" | "primary" | "accent" | "success" | "live";
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "w-6  h-6  text-2xs",
  sm: "w-8  h-8  text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
};

const ringClasses: Record<string, string> = {
  none:    "",
  primary: "ring-2 ring-primary/60 ring-offset-1 ring-offset-bg-base",
  accent:  "ring-2 ring-accent/60  ring-offset-1 ring-offset-bg-base",
  success: "ring-2 ring-success/60 ring-offset-1 ring-offset-bg-base",
  live:    "ring-2 ring-live/70    ring-offset-1 ring-offset-bg-base animate-pulse",
};

/**
 * Avatar
 * User/creator avatar. Supports image, initials fallback, and status ring.
 * Prop API: src / alt / initials / size / ring.
 */
export function Avatar({
  src,
  alt = "",
  initials,
  size = "md",
  ring = "none",
  className,
  ...props
}: AvatarProps): React.ReactElement {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full",
        "bg-primary-muted/80 text-primary-hover font-semibold",
        "overflow-hidden flex-shrink-0 select-none",
        sizeClasses[size],
        ringClasses[ring],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={alt || initials}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          aria-hidden={!alt}
        />
      ) : (
        <span aria-hidden="true">
          {initials?.slice(0, 2).toUpperCase() ?? "?"}
        </span>
      )}
    </span>
  );
}

// ── AvatarGroup ───────────────────────────────────────────────────────────────

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  avatars: Pick<AvatarProps, "src" | "alt" | "initials">[];
  size?: AvatarSize;
  max?: number;
}

export function AvatarGroup({
  avatars,
  size = "sm",
  max = 4,
  className,
  ...props
}: AvatarGroupProps): React.ReactElement {
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - max;

  return (
    <div
      className={["flex items-center", className].filter(Boolean).join(" ")}
      {...props}
    >
      {visible.map((av, i) => (
        <Avatar
          key={i}
          src={av.src}
          alt={av.alt}
          initials={av.initials}
          size={size}
          className="-ml-2 first:ml-0 border-2 border-bg-base"
        />
      ))}
      {overflow > 0 && (
        <span
          className={[
            "inline-flex items-center justify-center rounded-full",
            "bg-bg-overlay border-2 border-bg-base",
            "text-text-muted font-semibold -ml-2",
            sizeClasses[size],
          ].join(" ")}
          aria-label={`+${overflow} more`}
        >
          <span aria-hidden="true" className="text-2xs">
            +{overflow}
          </span>
        </span>
      )}
    </div>
  );
}
