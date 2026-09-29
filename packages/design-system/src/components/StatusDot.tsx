import React from "react";

export type StatusVariant = "live" | "offline" | "warn" | "success" | "idle";
export type StatusDotSize = "sm" | "md" | "lg";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusVariant;
  size?: StatusDotSize;
  label?: string;
  showLabel?: boolean;
  pulse?: boolean;
}

const statusConfig: Record<
  StatusVariant,
  { dotClass: string; textClass: string; label: string }
> = {
  live:    { dotClass: "bg-live",          textClass: "text-live",            label: "Live"    },
  offline: { dotClass: "bg-offline",       textClass: "text-text-muted",      label: "Offline" },
  warn:    { dotClass: "bg-warn",          textClass: "text-warn",            label: "Warning" },
  success: { dotClass: "bg-success",       textClass: "text-success",         label: "Online"  },
  idle:    { dotClass: "bg-text-disabled", textClass: "text-text-muted",      label: "Idle"    },
};

const sizeClasses: Record<StatusDotSize, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

/**
 * StatusDot
 * Visual indicator for stream/creator/operator status.
 * Pulses when status is "live". Prop API: status / size / label / showLabel / pulse.
 */
export function StatusDot({
  status,
  size = "md",
  label,
  showLabel = false,
  pulse,
  className,
  ...props
}: StatusDotProps): React.ReactElement {
  const config = statusConfig[status];
  const shouldPulse = pulse ?? status === "live";
  const displayLabel = label ?? config.label;

  return (
    <span
      role="status"
      aria-label={displayLabel}
      className={[
        "inline-flex items-center gap-1.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span
        aria-hidden="true"
        className={[
          "rounded-full flex-shrink-0",
          sizeClasses[size],
          config.dotClass,
          shouldPulse ? "animate-pulse-live" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {showLabel && (
        <span
          className={[
            "text-xs font-medium tracking-wide",
            config.textClass,
          ].join(" ")}
        >
          {displayLabel}
        </span>
      )}
    </span>
  );
}
