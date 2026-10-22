"use client";

import { useRef, useState } from "react";
import { del, post, put } from "@/lib/client";
import { composePicture, openPicture, shapeGap, UploadError, type FitMode } from "@/lib/graphic-upload";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { BranchLinks, GraphicTemplate } from "@/lib/types";
import { createPortal } from "react-dom";
import { Download, ExternalLink, Share2 } from "lucide-react";
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
import { QR_KINDS, normaliseLink, qrStandaloneSvg, svgToPng, type QrCorner } from "./qr-tile";
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
  /** The picture was uploaded from elsewhere, not made here (fields and options are then just the last design). */
  custom?: boolean;
}

function seedFields(seed?: GraphicSeed): GraphicFields {
  const base: GraphicFields = JSON.parse(JSON.stringify(DEFAULT_GRAPHIC_FIELDS));
  for (const [k, v] of Object.entries(seed?.fields ?? {})) Object.assign(base[k as GraphicTpl], v);
  return base;
}

/** Canva has no "open this picture" link for websites, so we open its page for the matching size; the picture goes in by upload or share. */
const CANVA_URL: Record<GraphicOptions["size"], string> = {
  post: "https://www.canva.com/create/instagram-posts/",
  story: "https://www.canva.com/create/instagram-stories/",
  banner: "https://www.canva.com/create/banners/",
};

const CORNERS: [QrCorner, string][] = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
];

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
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
  eventType,
}: {
  seed?: GraphicSeed;
  /** The kind of event this is for, so designs saved for that kind come first. */
  eventType?: string | null;
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
  const actor = useActor();
  const { data: saved } = useData<BranchLinks | null>("/api/branch-links");
  const canSaveLinks = hasAnyRole(actor, "social_media_officer", "organizer", "general_secretary");
  const exportRef = useRef<HTMLDivElement>(null);
  const { data: templates } = useData<GraphicTemplate[]>("/api/graphic-templates");
  const canSaveDesigns = canSaveLinks;
  const [saveOpen, setSaveOpen] = useState(false);
  const [designName, setDesignName] = useState("");
  const [keepText, setKeepText] = useState(true);
  const [manage, setManage] = useState(false);
  // A picture made elsewhere, standing in for the design. The decoded original is kept so Fit/Fill and Size can redo it.
  const [custom, setCustom] = useState<{ image: string; name: string; mode: FitMode; gap: number } | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const f = fields[tpl];
  const set = (k: string, v: string) => setFields((p) => ({ ...p, [tpl]: { ...p[tpl], [k]: v } }));
  const opt = <K extends keyof GraphicOptions>(k: K, v: GraphicOptions[K]) => setO((p) => ({ ...p, [k]: v }));
  const thumbO: GraphicOptions = { ...o, size: "post" };
  const dims = GRAPHIC_SIZE[o.size];
  const label = tpl === "event" ? fields.event.title : tpl === "reading" ? fields.reading.topic : tpl === "paper" ? fields.paper.headline : "quote";
  const name = `${slug(label)}-${o.size}.png`;

  const sortedTemplates = [...(templates ?? [])].sort((a, b) => Number(!!eventType && b.event_type === eventType) - Number(!!eventType && a.event_type === eventType));

  /** Start from a saved design. Wording the event already supplied (title, date, place) is never overwritten. */
  function applyTemplate(t: GraphicTemplate) {
    const fromEvent = new Set(Object.keys(seed?.fields?.[t.tpl] ?? {}));
    setCustom(null);
    setTpl(t.tpl);
    setO({ ...DEFAULT_GRAPHIC_OPTIONS, ...(t.options as Partial<GraphicOptions>) });
    setFields((p) => ({ ...p, [t.tpl]: { ...p[t.tpl], ...Object.fromEntries(Object.entries(t.fields).filter(([k]) => !fromEvent.has(k))) } }));
    toast(`Started from “${t.name}”`);
  }

  async function saveDesign() {
    const name = designName.trim();
    if (!name) return;
    try {
      await post("/api/graphic-templates", { name, tpl, options: o, fields: keepText ? f : {}, event_type: eventType ?? null });
      revalidate("/api/graphic-templates");
      setSaveOpen(false);
      setDesignName("");
      toast(`Saved “${name}”${keepText ? "" : " (style only)"}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the design");
    }
  }

  async function removeDesign(t: GraphicTemplate) {
    if (!window.confirm(`Remove “${t.name}”?`)) return;
    try {
      await del(`/api/graphic-templates/${t.id}`);
      revalidate("/api/graphic-templates");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove it");
    }
  }

  /** Fit the kept picture to a size and mode (all of it with bars, or filling the frame and cropping). */
  function composeCustom(size: GraphicOptions["size"], mode: FitMode, name: string) {
    const bitmap = bitmapRef.current;
    if (!bitmap) return;
    const d = GRAPHIC_SIZE[size];
    try {
      setCustom({ image: composePicture(bitmap, d.w, d.h, mode, COLOURWAYS[o.cw].bg), name, mode, gap: shapeGap(bitmap, d.w, d.h) });
    } catch (e) {
      toast(e instanceof UploadError ? e.message : "Couldn't use that picture");
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    try {
      const bitmap = await openPicture(file);
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      composeCustom(o.size, "fit", file.name);
    } catch (e) {
      toast(e instanceof UploadError ? e.message : "Couldn't use that picture");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeCustom() {
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setCustom(null);
  }

  function chooseSize(k: GraphicOptions["size"]) {
    opt("size", k);
    if (custom) composeCustom(k, custom.mode, custom.name);
  }

  async function render(kind: "png" | "jpeg" = "png"): Promise<string> {
    if (custom) return custom.image;
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
      download(url, custom ? name.replace(/\.png$/, ".jpg") : name);
      toast(custom ? "Picture saved" : `PNG saved · ${dims.w}px`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the PNG");
    }
  }

  const qrLink = normaliseLink(o.qr);
  const kind = QR_KINDS.find((k) => k.caption === o.qrCaption);
  const savedLink = kind?.saved ? (saved?.[kind.saved] ?? null) : null;

  /** A kind's chip sets its short caption and, when the branch has saved that link, fills it in. */
  function pickKind(k: (typeof QR_KINDS)[number]) {
    const link = k.saved ? saved?.[k.saved] : null;
    setO((p) => ({ ...p, qrCaption: k.caption, ...(link ? { qr: link } : {}) }));
  }

  async function saveLink() {
    if (!kind?.saved) return;
    try {
      await put("/api/branch-links", { [kind.saved]: qrLink });
      revalidate("/api/branch-links");
      toast(`Saved as your branch's ${kind.label} link`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the link");
    }
  }

  /** The QR on its own (PNG and SVG), for dropping into Canva or any editor and placing by hand. */
  async function saveQr() {
    if (!qrLink) return;
    try {
      const svg = await qrStandaloneSvg(qrLink, o.qrBrand);
      if (!svg) throw new Error("bad link");
      download(await svgToPng(svg), `${slug(label)}-qr.png`);
      download(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), `${slug(label)}-qr.svg`);
      toast("QR saved as PNG and SVG");
    } catch {
      toast("Couldn't make a QR from that link");
    }
  }

  /** Hand the finished picture to another app: the phone's share sheet lists Canva, Instagram and so on. */
  async function sendToApp() {
    try {
      const url = await render();
      const fileName = custom ? name.replace(/\.png$/, ".jpg") : name;
      const file = new File([await (await fetch(url)).blob()], fileName, { type: custom ? "image/jpeg" : "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: label });
      } else {
        download(url, fileName);
        toast("This browser has no share sheet. Saved the PNG: upload it in your editor.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(e instanceof Error ? e.message : "Couldn't share");
    }
  }

  async function openCanva() {
    // Save first so the PNG is ready to upload; the tab opens in the same tap so it isn't blocked.
    window.open(CANVA_URL[o.size], "_blank", "noopener");
    await save();
  }

  async function primary() {
    if (onUse) {
      try {
        const image = await render("jpeg");
        await onUse({ image, tpl, fields: { ...(f as Record<string, string>) }, options: o, custom: !!custom });
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
      const fileName = custom ? name.replace(/\.png$/, ".jpg") : name;
      const file = new File([blob], fileName, { type: blob.type || "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        download(url, fileName);
        toast("This browser can't share images — saved instead");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(e instanceof Error ? e.message : "Couldn't share");
    }
  }

  return (
    <>
      {!custom && (
        <div className="tabs4">
          {GRAPHIC_TEMPLATES.map(([id, label]) => (
            <button key={id} type="button" className={tpl === id ? "on" : ""} onClick={() => setTpl(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!custom && (sortedTemplates.length > 0 || canSaveDesigns) && (
        <div className="fld">
          <span>Saved designs</span>
          {sortedTemplates.length > 0 ? (
            <div className="mini" style={{ flexWrap: "wrap" }}>
              {sortedTemplates.map((t) => (
                <span key={t.id} style={{ display: "inline-flex" }}>
                  <button type="button" onClick={() => applyTemplate(t)}>
                    {t.name}
                    {eventType && t.event_type === eventType ? " ★" : ""}
                  </button>
                  {manage && canSaveDesigns && (
                    <button type="button" aria-label={`Remove ${t.name}`} onClick={() => removeDesign(t)}>
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Nothing saved yet. Make one the way you like it, then save it to start the next from here.
            </p>
          )}
          {eventType && sortedTemplates.some((t) => t.event_type === eventType) && (
            <p className="small" style={{ margin: "4px 0 0" }}>★ = made for this kind of event.</p>
          )}
          {canSaveDesigns && (
            <p className="small" style={{ margin: "6px 0 0", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button type="button" className="link" onClick={() => setSaveOpen((v) => !v)}>
                {saveOpen ? "Cancel" : "Save this design…"}
              </button>
              {sortedTemplates.length > 0 && (
                <button type="button" className="link" onClick={() => setManage((v) => !v)}>
                  {manage ? "Done" : "Remove one"}
                </button>
              )}
            </p>
          )}
          {saveOpen && canSaveDesigns && (
            <div className="stack6" style={{ marginTop: 8 }}>
              <input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="Name it, e.g. Open meeting · story" maxLength={60} aria-label="Name for this design" />
              <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} />
                Keep the wording too (not the date or time)
              </label>
              <button type="button" className="btn btn-p" disabled={!designName.trim()} onClick={saveDesign}>
                Save design
              </button>
              <p className="small" style={{ margin: 0 }}>Saves the layout, colours, size{o.qr ? ", QR" : ""}{eventType ? " and the kind of event" : ""}.</p>
            </div>
          )}
        </div>
      )}

      <div className="preview">
        <div className="pv-in">
          {custom ? (
            // eslint-disable-next-line @next/next/no-img-element -- the picture the person brought in, shown as it will be used
            <img src={custom.image} alt="Your picture" style={{ display: "block", width: "100%", height: "auto", maxHeight: 320, objectFit: "contain", margin: "0 auto" }} />
          ) : (
            <RcsGraphic tpl={tpl} f={f} o={o} />
          )}
        </div>
      </div>

      {custom && (
        <div className="fld">
          <span>Your picture · {custom.name}</span>
          {custom.gap > 0.12 && (
            <p className="small" style={{ margin: "0 0 6px" }}>
              It&apos;s a different shape from {GRAPHIC_SIZE[o.size].label.toLowerCase()} ({dims.w}×{dims.h}).{" "}
              {custom.mode === "fit" ? "All of it is shown, with bars at the sides. Fill crops the edges instead." : "It's cropped to fill the frame. Fit shows all of it with bars."}
            </p>
          )}
          <div className="opts">
            <div className="opt">
              <span>Shape</span>
              <div className="mini">
                <button type="button" className={custom.mode === "fit" ? "on" : ""} onClick={() => composeCustom(o.size, "fit", custom.name)}>
                  Fit
                </button>
                <button type="button" className={custom.mode === "fill" ? "on" : ""} onClick={() => composeCustom(o.size, "fill", custom.name)}>
                  Fill
                </button>
              </div>
            </div>
            <div className="opt">
              <span>Size</span>
              <div className="mini">
                {(Object.keys(GRAPHIC_SIZE) as GraphicOptions["size"][]).map((k) => (
                  <button key={k} type="button" className={o.size === k ? "on" : ""} onClick={() => chooseSize(k)}>
                    {GRAPHIC_SIZE[k].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>
            <button type="button" className="link" onClick={removeCustom}>
              Go back to the designer
            </button>
          </p>
        </div>
      )}

      {!custom && (
        <>
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
                <button key={k} type="button" className={o.size === k ? "on" : ""} onClick={() => chooseSize(k)}>
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
          <div className="fld">
            <span>QR code</span>
            <div className="opts">
              <div className="mini" style={{ flexWrap: "wrap" }}>
                {QR_KINDS.map((k) => (
                  <button key={k.id} type="button" className={o.qrCaption === k.caption ? "on" : ""} onClick={() => pickKind(k)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="fgrid">
              <div className="fld">
              <input
                value={o.qr}
                onChange={(e) => opt("qr", e.target.value)}
                placeholder={kind?.hint ?? "Paste a link: WhatsApp group, Instagram, a form…"}
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Link for the QR code"
              />
              </div>
              {o.qr && (
                <div className="fld">
                  <input value={o.qrCaption} onChange={(e) => opt("qrCaption", e.target.value)} placeholder="Caption under the QR (optional), e.g. whatsapp" aria-label="QR caption" />
                </div>
              )}
              </div>
              {kind?.saved && (
                <p className="small" style={{ margin: 0 }}>
                  {savedLink && normaliseLink(o.qr) === savedLink ? (
                    "This is your branch's saved link."
                  ) : o.qr && canSaveLinks ? (
                    <button type="button" className="link" onClick={saveLink}>
                      Save as our {kind.label} link
                    </button>
                  ) : !savedLink ? (
                    `No ${kind.label} link saved for your branch yet.${canSaveLinks ? " Paste it once and save it." : " Ask the social media officer to save it."}`
                  ) : null}
                </p>
              )}
              {o.qr && (
                <>
                  <div className="opt">
                    <span>Style</span>
                    <div className="mini">
                      <button type="button" className={o.qrBrand ? "on" : ""} onClick={() => opt("qrBrand", true)}>
                        Hammer &amp; sickle
                      </button>
                      <button type="button" className={!o.qrBrand ? "on" : ""} onClick={() => opt("qrBrand", false)}>
                        Plain
                      </button>
                    </div>
                  </div>
                  <div className="opt">
                    <span>Caption</span>
                    <div className="mini">
                      <button type="button" className={o.qrLower ? "on" : ""} onClick={() => opt("qrLower", true)}>
                        lowercase
                      </button>
                      <button type="button" className={!o.qrLower ? "on" : ""} onClick={() => opt("qrLower", false)}>
                        UPPERCASE
                      </button>
                    </div>
                  </div>
                  <div className="opt">
                    <span>Corner</span>
                    <div className="mini">
                      {CORNERS.map(([id, l]) => (
                        <button key={id} type="button" className={o.qrCorner === id ? "on" : ""} onClick={() => opt("qrCorner", id)}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="opt">
                    <span>QR size</span>
                    <input type="range" min="16" max="40" step="1" value={o.qrSize} onChange={(e) => opt("qrSize", +e.target.value)} />
                  </label>
                </>
              )}
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

        </>
      )}

      <div className="fld">
        <span>Edit it somewhere else</span>
        <p className="small" style={{ margin: "0 0 8px" }}>
          Want to move things around, swap the background or add your own pictures? Take it into Canva (or any editor): save the picture, upload it there{qrLink ? ", and add the QR on its own so you can place it exactly" : ""}. Made something there already? Bring it back with Use my own picture.
        </p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} aria-label="Choose a picture made elsewhere" />
        <div className="actbar" style={{ position: "static", padding: 0, border: 0, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-o grow" onClick={() => fileRef.current?.click()}>
            {custom ? "Choose a different picture" : "Use my own picture"}
          </button>
          <button type="button" className="btn btn-o grow" onClick={openCanva} disabled={exporting}>
            <ExternalLink size={16} strokeWidth={2.25} />
            Open in Canva
          </button>
          <button type="button" className="btn btn-o grow" onClick={sendToApp} disabled={exporting}>
            <Share2 size={16} strokeWidth={2.25} />
            Send to an app
          </button>
          {qrLink && !custom && (
            <button type="button" className="btn btn-o grow" onClick={saveQr}>
              <Download size={16} strokeWidth={2.25} />
              QR only
            </button>
          )}
        </div>
      </div>

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
