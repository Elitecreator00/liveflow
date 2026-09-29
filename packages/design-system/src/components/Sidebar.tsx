import React from "react";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  badge?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export interface SidebarSection {
  id: string;
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  sections: SidebarSection[];
  collapsed?: boolean;
  logo?: React.ReactNode;
  footer?: React.ReactNode;
  onNavigate?: (item: SidebarNavItem) => void;
  /** Mobile: drawer open state */
  mobileOpen?: boolean;
  /** Mobile: callback to close drawer */
  onMobileClose?: () => void;
}

/**
 * Sidebar
 * Navigation rail for the agency dashboard.
 * Desktop: collapsed (icon-only) or expanded.
 * Mobile: drawer overlay with backdrop.
 * Prop API: sections / collapsed / logo / footer / onNavigate / mobileOpen / onMobileClose.
 */
export function Sidebar({
  sections,
  collapsed = false,
  logo,
  footer,
  onNavigate,
  mobileOpen = false,
  onMobileClose,
  className,
  ...props
}: SidebarProps): React.ReactElement {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={[
          "flex flex-col bg-bg-surface border-r border-border",
          "transition-all duration-slow",
          "h-full overflow-hidden flex-shrink-0",
          // Desktop sizing
          "hidden md:flex",
          collapsed ? "md:w-14" : "md:w-56",
          // Mobile: fixed drawer
          mobileOpen
            ? "fixed left-0 top-0 z-[160] flex w-64 md:relative md:z-auto md:w-auto"
            : "fixed left-0 top-0 z-[160] md:relative md:z-auto -translate-x-full md:translate-x-0",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {/* Logo area */}
        {logo && (
          <div
            className={[
              "flex items-center h-14 px-3 border-b border-border flex-shrink-0",
              collapsed ? "justify-center" : "gap-2 px-4",
            ].join(" ")}
          >
            {logo}
          </div>
        )}

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {sections.map((section, sIdx) => (
            <div key={section.id} className={sIdx > 0 ? "mt-2" : ""}>
              {section.label && !collapsed && (
                <p className="px-4 py-1 text-2xs font-semibold text-text-muted uppercase tracking-[0.1em]">
                  {section.label}
                </p>
              )}
              <ul role="list" className="space-y-0.5 px-2">
                {section.items.map((item) => (
                  <SidebarNavItemComponent
                    key={item.id}
                    item={item}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer slot */}
        {footer && (
          <div className="flex-shrink-0 border-t border-border p-3">
            {footer}
          </div>
        )}
      </aside>

      {/* Mobile bottom nav (xs–sm screens) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-[140] md:hidden
          bg-bg-glass backdrop-blur-glass border-t border-border-glass
          flex items-center justify-around px-2 py-2 safe-area-inset-bottom"
      >
        {sections
          .flatMap((s) => s.items)
          .filter((item) => item.icon)
          .slice(0, 5)
          .map((item) => (
            <MobileNavItem key={item.id} item={item} onNavigate={onNavigate} />
          ))}
      </nav>
    </>
  );
}

interface SidebarNavItemComponentProps {
  item: SidebarNavItem;
  collapsed: boolean;
  onNavigate?: (item: SidebarNavItem) => void;
}

function SidebarNavItemComponent({
  item,
  collapsed,
  onNavigate,
}: SidebarNavItemComponentProps): React.ReactElement {
  const Tag: React.ElementType = item.href ? "a" : "button";

  const handleClick = () => {
    item.onClick?.();
    onNavigate?.(item);
  };

  return (
    <li>
      <Tag
        href={item.href}
        onClick={item.href ? undefined : handleClick}
        aria-current={item.active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={[
          "w-full flex items-center gap-2.5 rounded-lg",
          "text-sm font-medium transition-all duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
          item.active
            ? "bg-primary-muted/80 text-primary-hover border border-violet-600/20 shadow-glow-primary-sm"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-overlay border border-transparent",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {item.icon && (
          <span
            className={[
              "flex-shrink-0 text-base leading-none",
              item.active ? "text-primary-hover" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {item.icon}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="flex-shrink-0">{item.badge}</span>
            )}
          </>
        )}
      </Tag>
    </li>
  );
}

interface MobileNavItemProps {
  item: SidebarNavItem;
  onNavigate?: (item: SidebarNavItem) => void;
}

function MobileNavItem({ item, onNavigate }: MobileNavItemProps): React.ReactElement {
  const Tag: React.ElementType = item.href ? "a" : "button";

  const handleClick = () => {
    item.onClick?.();
    onNavigate?.(item);
  };

  return (
    <Tag
      href={item.href}
      onClick={item.href ? undefined : handleClick}
      aria-current={item.active ? "page" : undefined}
      aria-label={item.label}
      className={[
        "flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg",
        "text-2xs font-medium transition-all duration-fast min-w-[44px] min-h-[44px] justify-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        item.active
          ? "text-primary-hover"
          : "text-text-muted hover:text-text-primary",
      ].join(" ")}
    >
      {item.icon && (
        <span className="text-lg leading-none" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="truncate max-w-[52px]">{item.label}</span>
    </Tag>
  );
}
