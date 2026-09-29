import React from "react";

export type StatTrend = "up" | "down" | "neutral";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  trend?: StatTrend;
  trendLabel?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "accent" | "success" | "warn" | "danger";
  loading?: boolean;
}

const accentColorClasses = {
  primary: "text-primary",
  accent:  "text-accent",
  success: "text-success",
  warn:    "text-warn",
  danger:  "text-danger",
};

const accentBarClasses = {
  primary: "from-primary/70 to-violet-400/30",
  accent:  "from-accent/70 to-cyan-300/30",
  success: "from-success/70 to-emerald-300/30",
  warn:    "from-warn/70 to-amber-300/30",
  danger:  "from-danger/70 to-red-300/30",
};

const trendConfig: Record<StatTrend, { icon: string; class: string }> = {
  up:      { icon: "↑", class: "text-success" },
  down:    { icon: "↓", class: "text-danger"  },
  neutral: { icon: "→", class: "text-text-muted" },
};

/**
 * StatTile
 * KPI tile for dashboards. Displays metric label, value, trend indicator.
 * Prop API: label / value / subValue / trend / trendLabel / icon / accent / loading.
 */
export function StatTile({
  label,
  value,
  subValue,
  trend,
  trendLabel,
  icon,
  accent,
  loading = false,
  className,
  ...props
}: StatTileProps): React.ReactElement {
  return (
    <div
      className={[
        "relative bg-bg-surface rounded-xl border border-border p-5",
        "flex flex-col gap-3 overflow-hidden",
        "transition-all duration-normal",
        "hover:border-border-strong hover:bg-bg-elevated",
        "shadow-md hover:shadow-lg",
        "group",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {/* Gradient top accent line */}
      {accent && (
        <div
          aria-hidden="true"
          className={[
            "absolute inset-x-0 top-0 h-px bg-gradient-to-r",
            accentBarClasses[accent],
          ].join(" ")}
        />
      )}

      {/* Ambient corner glow */}
      {accent && (
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.07] blur-xl pointer-events-none"
          style={{
            background: accent === "primary" ? "#6d35d4" :
                        accent === "accent"  ? "#18c0e0" :
                        accent === "success" ? "#34d399" :
                        accent === "warn"    ? "#fbbf24" :
                                              "#f87171",
          }}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
          {label}
        </span>
        {icon && (
          <span
            className={[
              "flex-shrink-0 text-base opacity-70 group-hover:opacity-100 transition-opacity duration-normal",
              accent ? accentColorClasses[accent] : "text-text-muted",
            ].join(" ")}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value area */}
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="h-8 w-28 rounded-lg bg-bg-overlay animate-shimmer bg-[length:200%_100%]" />
          <div className="h-3 w-20 rounded bg-bg-overlay/60 animate-pulse" />
        </div>
      ) : (
        <>
          <div
            className={[
              "text-4xl font-bold tabular-nums leading-none tracking-tight font-mono",
              accent ? accentColorClasses[accent] : "text-text-primary",
            ].join(" ")}
          >
            {value}
          </div>

          {(subValue !== undefined || trend) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  className={[
                    "text-xs font-semibold",
                    trendConfig[trend].class,
                  ].join(" ")}
                  aria-label={`Trend: ${trend}`}
                >
                  {trendConfig[trend].icon}
                  {trendLabel && (
                    <span className="ml-0.5 font-medium">{trendLabel}</span>
                  )}
                </span>
              )}
              {subValue !== undefined && (
                <span className="text-xs text-text-muted">{subValue}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
