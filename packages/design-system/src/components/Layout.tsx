import React from "react";

// ── PageContainer ─────────────────────────────────────────────────────────────

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Max width preset */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Remove horizontal padding (for edge-to-edge layouts) */
  noPadding?: boolean;
}

const maxWidthClasses: Record<string, string> = {
  sm:   "max-w-2xl",
  md:   "max-w-4xl",
  lg:   "max-w-5xl",
  xl:   "max-w-7xl",
  "2xl":"max-w-screen-2xl",
  full: "max-w-none",
};

/**
 * PageContainer
 * Responsive page wrapper with max-width and consistent horizontal padding.
 * Use as the outermost layout container inside <main>.
 */
export function PageContainer({
  maxWidth = "xl",
  noPadding = false,
  children,
  className,
  ...props
}: PageContainerProps): React.ReactElement {
  return (
    <div
      className={[
        "w-full mx-auto",
        maxWidthClasses[maxWidth],
        noPadding ? "" : "px-4 sm:px-6 lg:px-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Column count at base/sm/md/lg/xl breakpoints */
  cols?: number | { base?: number; sm?: number; md?: number; lg?: number; xl?: number };
  gap?: "sm" | "md" | "lg";
}

const gapClasses = {
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
};

function colsToClass(cols: GridProps["cols"]): string {
  if (!cols) return "grid-cols-1";
  if (typeof cols === "number") {
    const map: Record<number, string> = {
      1: "grid-cols-1",
      2: "grid-cols-1 sm:grid-cols-2",
      3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
      6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
    };
    return map[cols] ?? `grid-cols-${cols}`;
  }
  const parts: string[] = [];
  if (cols.base) parts.push(`grid-cols-${cols.base}`);
  if (cols.sm)   parts.push(`sm:grid-cols-${cols.sm}`);
  if (cols.md)   parts.push(`md:grid-cols-${cols.md}`);
  if (cols.lg)   parts.push(`lg:grid-cols-${cols.lg}`);
  if (cols.xl)   parts.push(`xl:grid-cols-${cols.xl}`);
  return parts.join(" ");
}

/**
 * Grid
 * Responsive CSS grid wrapper.
 * Pass cols as number (shorthand) or breakpoint object for full control.
 */
export function Grid({
  cols = 1,
  gap = "md",
  children,
  className,
  ...props
}: GridProps): React.ReactElement {
  return (
    <div
      className={[
        "grid",
        colsToClass(cols),
        gapClasses[gap],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Stack ─────────────────────────────────────────────────────────────────────

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "horizontal" | "vertical";
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
}

const stackGapClasses = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

const alignClasses = {
  start:   "items-start",
  center:  "items-center",
  end:     "items-end",
  stretch: "items-stretch",
};

const justifyClasses = {
  start:   "justify-start",
  center:  "justify-center",
  end:     "justify-end",
  between: "justify-between",
  around:  "justify-around",
};

/**
 * Stack
 * Flex container utility for consistent spacing in one direction.
 */
export function Stack({
  direction = "vertical",
  gap = "md",
  align = "stretch",
  justify = "start",
  wrap = false,
  children,
  className,
  ...props
}: StackProps): React.ReactElement {
  return (
    <div
      className={[
        "flex",
        direction === "horizontal" ? "flex-row" : "flex-col",
        stackGapClasses[gap],
        alignClasses[align],
        justifyClasses[justify],
        wrap ? "flex-wrap" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  label?: string;
}

/**
 * Section
 * Page section wrapper with optional aria-label and consistent vertical spacing.
 */
export function Section({
  label,
  children,
  className,
  ...props
}: SectionProps): React.ReactElement {
  return (
    <section
      aria-label={label}
      className={["space-y-4", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </section>
  );
}
