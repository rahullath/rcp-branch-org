"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./ui";

export interface ActionMenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Falsy items are skipped, so callers can write `cond && {…}`. */
  hidden?: boolean;
}

/**
 * Overflow "⋯" menu with *labelled* items — one place for the secondary
 * actions on a card, so the card itself doesn't need a row of ambiguous
 * icon-only buttons.
 */
export function ActionMenu({
  items,
  className,
  label = "More actions",
}: {
  items: (ActionMenuItem | false | null | undefined)[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((i): i is ActionMenuItem => !!i && !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center border border-paper-shadow bg-surface-container-lowest text-on-surface-variant transition-colors hover:border-primary hover:text-primary",
          open && "border-primary text-primary",
        )}
      >
        <Icon name="more_horiz" className="text-lg" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-56 border border-paper-shadow bg-surface-container-lowest shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-container",
                item.danger ? "text-error" : "text-on-surface",
              )}
            >
              <Icon name={item.icon} className="text-base" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
