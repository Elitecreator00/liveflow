import React from "react";

export interface TopbarProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  logo?: React.ReactNode;
  title?: React.ReactNode;
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  borderBottom?: boolean;
}

/**
 * Topbar
 * Primary application header with glassmorphism.
 * Fixed height, flex layout with left/center/right slots.
 * Prop API: logo / title / left / center / right / borderBottom.
 */
export function Topbar({
  logo,
  title,
  left,
  center,
  right,
  borderBottom = true,
  className,
  ...props
}: TopbarProps): React.ReactElement {
  return (
    <header
      className={[
        "flex items-center h-14 px-4 gap-3",
        "bg-bg-glass backdrop-blur-glass",
        "flex-shrink-0 z-[100]",
        borderBottom ? "border-b border-border-glass" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {/* Left slot */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {logo && (
          <div className="flex-shrink-0" aria-label="Logo">
            {logo}
          </div>
        )}
        {title && (
          <h1 className="text-base font-semibold text-text-primary truncate tracking-tight">
            {title}
          </h1>
        )}
        {left && <div className="flex items-center gap-2">{left}</div>}
      </div>

      {/* Center slot */}
      {center && (
        <div className="flex items-center justify-center gap-3 flex-shrink-0">
          {center}
        </div>
      )}

      {/* Right slot */}
      {right && (
        <div className="flex items-center gap-2 flex-shrink-0 justify-end">
          {right}
        </div>
      )}
    </header>
  );
}
