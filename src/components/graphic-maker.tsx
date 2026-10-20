"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { toJpeg, toPng } from "html-to-image";
import {
  COLOURWAYS,
  CTA_SUGGESTIONS,
  DEFAULT_GRAPHIC_FIELDS,
  DEFAULT_GRAPHIC_OPTIONS,
  GRAPHIC_LAYOUTS,
  GRAPHIC_SIZE,
  GRAPHIC_TEMPLATES,
  RcsGraphic,
  type ColourwayId,
  type GraphicFields,
  type GraphicOptions,
  type GraphicTpl,
} from "./rcs-graphic";
import { useToast } from "./v2/toast";

type FieldDef = [key: string, label: string, multiline?: boolean, half?: boolean];

const FIELD_DEFS: Record<GraphicTpl, FieldDef[]> = {
  event: [
    ["kicker", "Top line"],
    ["title", "Title"],
    ["sub", "Subtitle / speaker"],
    ["date", "Date", false, true],
    ["time", "Time", false, true],
    ["where", "Location"],
    ["cta", "Call to action"],
    ["link", "Link"],
  ],
  quote: [
    ["quote", "Quote", true],
    ["attribution", "Attribution"],
  ],
  reading: [
    ["session", "Session"],
    ["topic", "Topic"],
    ["when", "When / where"],
  ],
  paper: [
    ["headline", "Headline"],
    ["bullets", "Inside (one per line)", true],
  ],
};

export interface GraphicSeed {
  tpl?: GraphicTpl;
  fields?: { [K in GraphicTpl]?: Partial<GraphicFields[K]> };
  options?: Partial<GraphicOptions>;
}

/** What "Use" hands back: the rendered picture (JPEG, small enough to store) and the settings to reopen it. */
export interface GraphicResult {
  image: string;
  tpl: GraphicTpl;
  fields: Record<string, string>;
  options: GraphicOptions;
}

function seedFields(seed?: GraphicSeed): GraphicFields {
  const base: GraphicFields = JSON.parse(JSON.stringify(DEFAULT_GRAPHIC_FIELDS));
  for (const [k, v] of Object.entries(seed?.fields ?? {})) Object.assign(base[k as GraphicTpl], v);
  return base;
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "graphic";
}

/**
 * The RCS graphic maker: five event layouts, four colourways, eight text
 * fields (blank ones disappear from the design), clean or rough title,
 * alignment, title size, emblem and grain. The preview stays pinned while
 * you edit; Save renders the same design at full size to a PNG.
 */
export function GraphicMaker({
  seed,
  primaryLabel = "Share",
  onPrimary,
  onUse,
}: {
  seed?: GraphicSeed;
  /** e.g. "Attach to post". Default shares the PNG (or downloads it). */
  primaryLabel?: string;
  onPrimary?: () => Promise<void> | void;
  /** Set → the main button hands the rendered graphic back instead of saving it (e.g. for a share link). */
  onUse?: (out: GraphicResult) => Promise<void> | void;
}) {
  const toast = useToast();
  const [tpl, setTpl] = useState<GraphicTpl>(seed?.tpl ?? "event");
  const [o, setO] = useState<GraphicOptions>({ ...DEFAULT_GRAPHIC_OPTIONS, ...(seed?.options ?? {}) });
  const [panel, setPanel] = useState<"design" | "text">("design");
  const [fields, setFields] = useState<GraphicFields>(() => seedFields(seed));
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const f = fields[tpl];
  const set = (k: string, v: string) => setFields((p) => ({ ...p, [tpl]: { ...p[tpl], [k]: v } }));
  const opt = <K extends keyof GraphicOptions>(k: K, v: GraphicOptions[K]) => setO((p) => ({ ...p, [k]: v }));
  const thumbO: GraphicOptions = { ...o, size: "post" };
  const dims = GRAPHIC_SIZE[o.size];
  const label = tpl === "event" ? fields.event.title : tpl === "reading" ? fields.reading.topic : tpl === "paper" ? fields.paper.headline : "quote";
  const name = `${slug(label)}-${o.size}.png`;

  async function render(kind: "png" | "jpeg" = "png"): Promise<string> {
    setExporting(true);
    // Let the full-size copy mount, fonts settle, and images load.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const node = exportRef.current;
    if (!node) throw new Error("Couldn't render the graphic");
    await Promise.all([...node.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
    try {
      const opts = { width: dims.w, height: dims.h, pixelRatio: 1, cacheBust: true };
      return kind === "jpeg" ? await toJpeg(node.firstElementChild as HTMLElement, { ...opts, quality: 0.82 }) : await toPng(node.firstElementChild as HTMLElement, opts);
    } finally {
      setExporting(false);
    }
  }

  async function save() {
    try {
      const url = await render();
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      toast(`PNG saved · ${dims.w}px`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the PNG");
    }
  }

  async function primary() {
    if (onUse) {
      try {
        const image = await render("jpeg");
        await onUse({ image, tpl, fields: { ...(f as Record<string, string>) }, options: o });
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't use that graphic");
      }
      return;
    }
    if (onPrimary) {
      await save();
      await onPrimary();
      return;
    }
    try {
      const url = await render();
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        toast("This browser can't share images — saved instead");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(e instanceof Error ? e.message : "Couldn't share");
    }
  }

  return (
    <>
      <div className="tabs4">
        {GRAPHIC_TEMPLATES.map(([id, label]) => (
          <button key={id} type="button" className={tpl === id ? "on" : ""} onClick={() => setTpl(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="preview">
        <div className="pv-in">
          <RcsGraphic tpl={tpl} f={f} o={o} />
        </div>
      </div>

      <div className="tabs2">
        <button type="button" className={panel === "design" ? "on" : ""} onClick={() => setPanel("design")}>
          Design
        </button>
        <button type="button" className={panel === "text" ? "on" : ""} onClick={() => setPanel("text")}>
          Text
        </button>
      </div>

      {panel === "design" && (
        <>
          {tpl === "event" && (
            <div className="fld">
              <span>Layout</span>
              <div className="thumbs">
                {GRAPHIC_LAYOUTS.map(([id, label]) => (
                  <button key={id} type="button" className={"th" + (o.layout === id ? " on" : "")} onClick={() => opt("layout", id)} aria-pressed={o.layout === id}>
                    <div className="th-art">
                      <RcsGraphic tpl="event" f={fields.event} o={{ ...thumbO, layout: id }} />
                    </div>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="fld">
            <span>Colourway</span>
            <div className="thumbs c4">
              {(Object.keys(COLOURWAYS) as ColourwayId[]).map((k) => (
                <button key={k} type="button" className={"th" + (o.cw === k ? " on" : "")} onClick={() => opt("cw", k)} aria-pressed={o.cw === k}>
                  <div className="th-art">
                    <RcsGraphic tpl={tpl} f={f} o={{ ...thumbO, cw: k }} />
                  </div>
                  <span>{COLOURWAYS[k].label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="fld">
            <span>Size</span>
            <div className="tabs3">
              {(Object.keys(GRAPHIC_SIZE) as GraphicOptions["size"][]).map((k) => (
                <button key={k} type="button" className={o.size === k ? "on" : ""} onClick={() => opt("size", k)}>
                  {GRAPHIC_SIZE[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="fld">
            <span>Options</span>
            <div className="opts">
              <div className="opt">
                <span>Title font</span>
                <div className="mini">
                  <button type="button" className={!o.rough ? "on" : ""} onClick={() => opt("rough", false)}>
                    Clean
                  </button>
                  <button type="button" className={o.rough ? "on" : ""} onClick={() => opt("rough", true)}>
                    Rough
                  </button>
                </div>
              </div>
              {(tpl !== "event" || ["stack", "poster", "split"].includes(o.layout)) && (
                <div className="opt">
                  <span>Align</span>
                  <div className="mini">
                    <button type="button" className={o.align === "left" ? "on" : ""} onClick={() => opt("align", "left")}>
                      Left
                    </button>
                    <button type="button" className={o.align === "center" ? "on" : ""} onClick={() => opt("align", "center")}>
                      Centre
                    </button>
                  </div>
                </div>
              )}
              <label className="opt">
                <span>Title size</span>
                <input type="range" min="0.7" max="1.3" step="0.05" value={o.scale} onChange={(e) => opt("scale", +e.target.value)} />
              </label>
              <div className="opt">
                <span>Emblem</span>
                <div className="mini">
                  <button type="button" className={o.emblem ? "on" : ""} onClick={() => opt("emblem", true)}>
                    On
                  </button>
                  <button type="button" className={!o.emblem ? "on" : ""} onClick={() => opt("emblem", false)}>
                    Off
                  </button>
                </div>
              </div>
              <div className="opt">
                <span>Print grain</span>
                <div className="mini">
                  <button type="button" className={o.grain ? "on" : ""} onClick={() => opt("grain", true)}>
                    On
                  </button>
                  <button type="button" className={!o.grain ? "on" : ""} onClick={() => opt("grain", false)}>
                    Off
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {panel === "text" && (
        <div className="fgrid">
          {FIELD_DEFS[tpl].map(([k, label, multi, half]) => {
            const value = (f as Record<string, string>)[k] ?? "";
            return (
              <label key={k} className={"fld" + (half ? " half" : "")}>
                <span>{label}</span>
                {multi ? (
                  <textarea rows={3} value={value} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input value={value} onChange={(e) => set(k, e.target.value)} placeholder="Leave blank to hide" list={k === "cta" ? "cta-suggestions" : undefined} />
                )}
              </label>
            );
          })}
          <datalist id="cta-suggestions">
            {CTA_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      )}

      <div className="actbar">
        <button type="button" className="btn btn-o grow" onClick={save} disabled={exporting}>
          <Download size={16} strokeWidth={2.25} />
          Save
        </button>
        <button type="button" className="btn btn-p grow" onClick={primary} disabled={exporting}>
          {primaryLabel}
        </button>
      </div>

      {exporting &&
        createPortal(
          <div ref={exportRef} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
            <RcsGraphic tpl={tpl} f={f} o={o} unitPx={Math.min(dims.w, dims.h) / 100} />
          </div>,
          document.body,
        )}
    </>
  );
}
