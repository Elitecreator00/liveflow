import React, { createContext, useContext, useId } from "react";

// ── Context ───────────────────────────────────────────────────────────────────

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs sub-component must be inside <Tabs>");
  return ctx;
}

// ── Tabs Root ─────────────────────────────────────────────────────────────────

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
  ...props
}: TabsProps): React.ReactElement {
  const baseId = useId();

  return (
    <TabsContext.Provider value={{ value, onChange: onValueChange, baseId }}>
      <div className={["flex flex-col gap-0", className].filter(Boolean).join(" ")} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ── TabsList ──────────────────────────────────────────────────────────────────

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "pills" | "underline";
}

const listVariantClasses = {
  default:  "bg-bg-elevated border border-border rounded-xl p-1 gap-0.5",
  pills:    "gap-1",
  underline:"border-b border-border gap-0 pb-px",
};

export function TabsList({
  variant = "default",
  children,
  className,
  ...props
}: TabsListProps): React.ReactElement {
  return (
    <div
      role="tablist"
      className={[
        "flex items-center w-fit",
        listVariantClasses[variant],
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

// ── TabsTrigger ───────────────────────────────────────────────────────────────

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  variant?: "default" | "pills" | "underline";
}

const triggerActiveClasses = {
  default:  "bg-bg-overlay text-text-primary shadow-sm",
  pills:    "bg-primary-muted/80 text-primary-hover border border-violet-600/20 shadow-glow-primary-sm",
  underline:"text-text-primary border-b-2 border-primary-hover -mb-px",
};

const triggerInactiveClasses = {
  default:  "text-text-secondary hover:text-text-primary",
  pills:    "text-text-secondary hover:text-text-primary hover:bg-bg-overlay border border-transparent",
  underline:"text-text-secondary hover:text-text-primary border-b-2 border-transparent -mb-px",
};

export function TabsTrigger({
  value,
  variant = "default",
  children,
  className,
  ...props
}: TabsTriggerProps): React.ReactElement {
  const { value: activeValue, onChange, baseId } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={isActive}
      onClick={() => onChange(value)}
      className={[
        "px-3 py-1.5 rounded-lg text-sm font-medium",
        "transition-all duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "whitespace-nowrap",
        isActive
          ? triggerActiveClasses[variant]
          : triggerInactiveClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

// ── TabsContent ───────────────────────────────────────────────────────────────

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  children,
  className,
  ...props
}: TabsContentProps): React.ReactElement {
  const { value: activeValue, baseId } = useTabsContext();
  const isActive = activeValue === value;

  if (!isActive) return <></>;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={["animate-fade-in focus-visible:outline-none", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
