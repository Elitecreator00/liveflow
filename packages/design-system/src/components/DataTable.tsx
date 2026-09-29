import React from "react";

export type SortDirection = "asc" | "desc" | null;

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  accessor: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
  alignment?: "left" | "center" | "right";
  className?: string;
}

export interface DataTableProps<T extends { id: string | number }> {
  columns: ColumnDef<T>[];
  rows: T[];
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: React.ReactNode;
  rowClassName?: (row: T) => string;
  stickyHeader?: boolean;
  className?: string;
}

const alignClass = {
  left:   "text-left",
  center: "text-center",
  right:  "text-right",
};

const SortIcon = ({ direction }: { direction: SortDirection }): React.ReactElement => (
  <span
    aria-hidden="true"
    className={[
      "ml-1 text-xs transition-opacity duration-fast",
      direction ? "opacity-80 text-primary-hover" : "opacity-30",
    ].join(" ")}
  >
    {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
  </span>
);

/**
 * DataTable
 * Premium accessible data grid. Supports sorting, row click, skeleton, empty states.
 * Prop API: columns / rows / sortKey / sortDirection / onSort / onRowClick /
 *           loading / emptyMessage / rowClassName / stickyHeader / className.
 */
export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  sortKey,
  sortDirection = null,
  onSort,
  onRowClick,
  loading = false,
  emptyMessage = "No data available",
  rowClassName,
  stickyHeader = false,
  className,
}: DataTableProps<T>): React.ReactElement {
  return (
    <div
      className={[
        "relative rounded-xl overflow-hidden",
        "border border-border bg-bg-surface",
        "shadow-md",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="overflow-x-auto">
        <table
          role="grid"
          className="w-full border-collapse text-sm"
        >
          <thead
            className={[
              "bg-bg-elevated",
              stickyHeader ? "sticky top-0 z-raised" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <tr>
              {columns.map((col) => {
                const isActive = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={[
                      "px-4 py-3 font-semibold text-xs uppercase tracking-widest",
                      "text-text-muted border-b border-border",
                      alignClass[col.alignment ?? col.align ?? "left"],
                      col.sortable
                        ? "cursor-pointer select-none hover:text-text-secondary transition-colors duration-fast"
                        : "",
                      isActive ? "text-text-secondary" : "",
                      col.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={
                      col.sortable && onSort
                        ? () => onSort(col.key)
                        : undefined
                    }
                    aria-sort={
                      isActive
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : col.sortable
                        ? "none"
                        : undefined
                    }
                  >
                    {col.header}
                    {col.sortable && (
                      <SortIcon direction={isActive ? sortDirection : null} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <div
                        className="h-4 rounded-md bg-bg-overlay animate-shimmer bg-[length:200%_100%]"
                        style={{ width: `${50 + (i * 13 + col.key.length * 7) % 35}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-16 text-center text-text-muted text-sm"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={[
                    "border-b border-border last:border-0",
                    "transition-colors duration-fast",
                    "text-text-primary",
                    onRowClick
                      ? "cursor-pointer hover:bg-bg-overlay focus-visible:bg-bg-overlay outline-none"
                      : "",
                    rowClassName?.(row),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        "px-4 py-3.5",
                        alignClass[col.alignment ?? col.align ?? "left"],
                        col.className,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {col.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
