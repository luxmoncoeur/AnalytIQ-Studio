"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_EDITABLE_ROWS = 200;

/**
 * Editable data grid (X/Y by default; pass `columns` for other layouts, e.g.
 * one column per sample). Enter moves to the next cell, then the next row
 * (adding one at the end) so data can be typed quickly from a worksheet.
 *
 * @param {{ rows: Record<string, string>[], labels?: { x?: string, y?: string }, columns?: { key: string, label: string, tag: string }[], errors: Record<string, Record<string, string>>, showErrors: boolean, onCellChange: Function, onAddRow: Function, onRemoveRow: Function, caption?: string }} props
 */
export function DataTableEditor({
  rows,
  labels = {},
  columns,
  errors,
  showErrors,
  onCellChange,
  onAddRow,
  onRemoveRow,
  caption = "Data points. Press Enter to move to the next cell.",
}) {
  const visible = rows.slice(0, MAX_EDITABLE_ROWS);
  const cols = columns ?? [
    { key: "x", label: labels.x || "X", tag: "X" },
    { key: "y", label: labels.y || "Y", tag: "Y" },
  ];

  const focusCell = (rowIndex, column) => {
    requestAnimationFrame(() => {
      document.querySelector(`[data-cell="${rowIndex}-${column}"]`)?.focus();
    });
  };

  const handleKeyDown = (event, rowIndex, column) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = cols.findIndex((col) => col.key === column) + 1;
    if (next < cols.length) return focusCell(rowIndex, cols[next].key);
    if (rowIndex === rows.length - 1) onAddRow();
    focusCell(rowIndex + 1, cols[0].key);
  };

  return (
    <div className="space-y-2">
      <div className="max-h-[340px] overflow-auto rounded-md border border-border/80 bg-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="w-9 px-2 py-1.5 text-center">
                #
              </th>
              {cols.map((col) => (
                <th key={col.key} scope="col" className="px-1.5 py-1.5">
                  {col.label} <span className="font-mono">({col.tag})</span>
                </th>
              ))}
              <th scope="col" className="w-10 px-1 py-1.5 text-center">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const rowErrors = showErrors ? errors[row.id] : undefined;
              return (
                <tr
                  key={row.id}
                  className="border-t border-border/60 transition-colors hover:bg-muted/40"
                >
                  <td className="px-2 py-1 text-center font-mono text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>
                  {cols.map(({ key: column, tag }) => (
                    <td key={column} className="px-1.5 py-1">
                      <Input
                        data-cell={`${index}-${column}`}
                        value={row[column]}
                        onChange={(event) => onCellChange(row.id, column, event.target.value)}
                        onKeyDown={(event) => handleKeyDown(event, index, column)}
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Row ${index + 1}, ${tag}`}
                        aria-invalid={rowErrors?.[column] ? true : undefined}
                        title={rowErrors?.[column]}
                        placeholder="—"
                        className={cn(
                          "h-8 min-h-[32px] rounded-md font-mono text-xs tabular-nums sm:text-sm",
                          rowErrors?.[column] && "border-destructive",
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 min-h-[28px] min-w-[28px] touch-manipulation rounded-md text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveRow(row.id)}
                      disabled={rows.length === 1}
                      aria-label={`Remove row ${index + 1}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_EDITABLE_ROWS ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_EDITABLE_ROWS} of {rows.length.toLocaleString("en-US")} rows for
          editing. All rows are used in the analysis.
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={onAddRow}
        className="h-8 w-full rounded-md border-dashed text-xs"
      >
        <Plus className="size-3.5" aria-hidden="true" /> Add row
      </Button>
    </div>
  );
}
