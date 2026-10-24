"use client";

import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

/** DataTable — dense ops table primitive (32px rows, hairline rules). */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyText = "Nothing here yet.",
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-ink-2">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-rule">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`eyebrow px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-rule ${onRowClick ? "cursor-pointer hover:bg-paper" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 align-top ${c.align === "right" ? "text-right" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
