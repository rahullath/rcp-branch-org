"use client";

import { IMPORT_MODULES, MODULE_LABEL, type ImportModule, type JsonImportLine } from "@/lib/import-prompt";

export const lineKey = (l: Pick<JsonImportLine, "module" | "index">) => `${l.module}:${l.index}`;

/** Rows left unticked by default: already there, or looks like something that is. */
export const startOff = (lines: JsonImportLine[]) => new Set(lines.filter((l) => l.change === "skip" || l.similar?.length).map(lineKey));

export function pickedRows(lines: JsonImportLine[], off: Set<string>) {
  const only: Partial<Record<ImportModule, number[]>> = {};
  for (const l of lines) if (l.change === "create" && !off.has(lineKey(l))) (only[l.module] ??= []).push(l.index);
  return only;
}

/**
 * The preview, one block per module. Each row can be unticked; anything
 * that resembles what's already there says what, so a person can decide
 * whether it's new or the same thing in other words.
 */
export function ImportLines({ lines, off, setOff }: { lines: JsonImportLine[]; off: Set<string>; setOff: (fn: (p: Set<string>) => Set<string>) => void }) {
  return (
    <>
      {IMPORT_MODULES.map((m) => {
        const rows = lines.filter((l) => l.module === m);
        if (!rows.length) return null;
        return (
          <div key={m} className="mt8">
            <p className="t" style={{ margin: "8px 0 4px" }}>
              {MODULE_LABEL[m]} <span className="muted">· {rows.length}</span>
            </p>
            <div className="matlist">
              {rows.map((l) => {
                const k = lineKey(l);
                const on = l.change === "create" && !off.has(k);
                return (
                  <label key={k} className="mat-r" style={{ gap: 8, opacity: on || l.similar?.length ? 1 : 0.5 }}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={l.change === "skip"}
                      onChange={() =>
                        setOff((p) => {
                          const n = new Set(p);
                          if (n.has(k)) n.delete(k);
                          else n.add(k);
                          return n;
                        })
                      }
                    />
                    <span className="grow min0">
                      <span className="t" style={{ display: "block" }}>
                        {l.label}
                      </span>
                      <span className="small">{l.detail}</span>
                      {!!l.similar?.length && (
                        <span className="small red" style={{ display: "block" }}>
                          Same as {l.similar.map((s) => `“${s}”`).join(" or ")}? Tick it if it&apos;s new.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
