"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./ui";

/**
 * Small "⋮" overflow menu for Edit/Delete on a list row or card. Only pass
 * the callbacks you want shown — visibility is driven by the caller's own
 * `canManage`/`hasAnyRole` check (src/lib/permissions.ts), so a resource
 * with neither renders nothing.
 */
export function RowActions({
  onEdit,
  onDelete,
  className,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!onEdit && !onDelete) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
        aria-label="Row actions"
      >
        <Icon name="more_vert" className="text-lg" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-36 border border-paper-shadow bg-surface-container-lowest shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container"
            >
              <Icon name="edit" className="text-base" /> Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error hover:bg-surface-container"
            >
              <Icon name="delete" className="text-base" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
