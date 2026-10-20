"use client";

import { useState } from "react";
import type { Actor } from "@/lib/auth";
import type { AgendaContribution, AgendaItem, PrepLink, PrepLinkKind, Profile } from "@/lib/types";
import { relativeDaysAgo } from "@/lib/utils";
import { RowActions } from "@/components/row-actions";
import { ALL_RESOURCES } from "@/data/resources";
import { Badge, Button, Card, Icon, Input, Select, Spinner } from "@/components/ui";

/*
 * A political discussion item: lead-off, prep links (officer-curated, with
 * the resource library) and open questions & contributions from anyone.
 */

const KIND_BADGE: Record<PrepLinkKind, { label: string; tone: "neutral" | "primary" | "tertiary" }> = {
  article: { label: "Article", tone: "neutral" },
  youtube: { label: "YouTube", tone: "primary" },
  spotify: { label: "Spotify", tone: "tertiary" },
  podcast: { label: "Podcast", tone: "tertiary" },
};

const KIND_LABEL: Record<PrepLinkKind, string> = {
  article: "Article",
  youtube: "YouTube",
  spotify: "Spotify",
  podcast: "Podcast",
};

function profileName(id: string | null | undefined, profiles: Profile[]): string | null {
  return id ? (profiles.find((p) => p.id === id)?.name ?? null) : null;
}

export function PoliticalItemCard({
  item,
  onPatchItem,
  editable,
  onEdit,
  onDelete,
  contributions,
  profiles,
  actor,
  onAddContribution,
  onDeleteContribution,
}: {
  item: AgendaItem;
  onPatchItem: (item: AgendaItem, patch: Partial<AgendaItem>) => Promise<void>;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  contributions: AgendaContribution[];
  profiles: Profile[];
  actor: Actor | null;
  onAddContribution: (text: string) => Promise<void>;
  onDeleteContribution: (id: string) => Promise<void>;
}) {
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState<PrepLinkKind>("article");
  const [librarySearch, setLibrarySearch] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");

  function pickFromLibrary(label: string) {
    const hit = ALL_RESOURCES.find((r) => r.title === label);
    if (!hit) return;
    setLinkLabel(hit.title);
    setLinkUrl(hit.url);
    setLinkKind(hit.kind);
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const next: PrepLink[] = [...(item.prep_links ?? []), { label: linkLabel.trim() || KIND_LABEL[linkKind], url: linkUrl.trim(), kind: linkKind }];
    await onPatchItem(item, { prep_links: next });
    setLinkLabel("");
    setLinkUrl("");
    setLinkKind("article");
    setLibrarySearch("");
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-label-md font-bold text-on-surface">{item.title}</h4>
        {item.duration && <Badge tone="neutral">{item.duration} min</Badge>}
        <RowActions className="ml-auto" onEdit={editable ? onEdit : undefined} onDelete={editable ? onDelete : undefined} />
      </div>
      {item.leadoff_name && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-on-surface">
          <Icon name="mic" className="text-sm text-primary" /> Leadoff: {item.leadoff_name}
        </p>
      )}
      {item.description && <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>}

      {(item.prep_links ?? []).length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Read or listen before</p>
          <ul className="mt-1 space-y-1">
            {(item.prep_links ?? []).map((l, i) => (
              <li key={`${l.url}-${i}`} className="flex min-w-0 items-center gap-1.5 text-sm">
                {l.kind && <Badge tone={KIND_BADGE[l.kind].tone} className="shrink-0">{KIND_BADGE[l.kind].label}</Badge>}
                {renaming === i ? (
                  <form
                    className="flex min-w-0 flex-1 gap-1.5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const next = (item.prep_links ?? []).map((x, j) => (j === i ? { ...x, label: renameText.trim() || x.label } : x));
                      setRenaming(null);
                      await onPatchItem(item, { prep_links: next });
                    }}
                  >
                    <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} className="min-w-0 flex-1" aria-label="Title" autoFocus />
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                ) : (
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-primary underline" title={l.url}>
                    {l.label}
                  </a>
                )}
                {editable && renaming !== i && (
                  <>
                    <button type="button" className="shrink-0 text-xs text-on-surface-variant underline" onClick={() => (setRenaming(i), setRenameText(l.label))}>
                      Rename
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-on-surface-variant underline"
                      onClick={() => onPatchItem(item, { prep_links: (item.prep_links ?? []).filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && (
        <>
          <datalist id={`library-resources-${item.id}`}>
            {ALL_RESOURCES.map((r) => (
              <option key={`${r.title}-${r.url}`} value={r.title} />
            ))}
          </datalist>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input
                list={`library-resources-${item.id}`}
                value={librarySearch}
                onChange={(e) => {
                  setLibrarySearch(e.target.value);
                  pickFromLibrary(e.target.value);
                }}
                placeholder="Add from library…"
                className="min-w-0 flex-1"
              />
            </div>
            <form onSubmit={addLink} className="flex flex-wrap gap-2">
              <Select value={linkKind} onChange={(e) => setLinkKind(e.target.value as PrepLinkKind)} className="w-32 flex-none" aria-label="Link type">
                <option value="article">Article</option>
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="podcast">Podcast</option>
              </Select>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste a link · the title fills itself in"
                className="min-w-0 flex-1"
              />
              <Button type="submit" size="sm" variant="outline" title="Add link">
                <Icon name="add" />
              </Button>
            </form>
          </div>
        </>
      )}

      <ContributionsBox
        item={item}
        contributions={contributions}
        profiles={profiles}
        actor={actor}
        canModerate={editable}
        onAdd={onAddContribution}
        onDelete={onDeleteContribution}
      />
    </Card>
  );
}

/**
 * Open to every comrade, deliberately not gated like `prep_links` above —
 * branch prep shouldn't require officer curation to raise a question or a
 * point you want to make. No approval step: it's visible the moment it's
 * added, and anyone can delete their own.
 */
function ContributionsBox({
  item,
  contributions,
  profiles,
  actor,
  canModerate,
  onAdd,
  onDelete,
}: {
  item: AgendaItem;
  contributions: AgendaContribution[];
  profiles: Profile[];
  actor: Actor | null;
  canModerate: boolean;
  onAdd: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onAdd(text.trim());
      setText("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-paper-shadow pt-3">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
        Questions &amp; contributions{contributions.length > 0 && ` (${contributions.length})`}
      </p>
      {contributions.length > 0 && (
        <ul className="mt-2 space-y-2">
          {contributions.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-none border border-paper-shadow bg-surface-container-lowest p-2.5">
              <Icon name="chat" className="mt-0.5 shrink-0 text-sm text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-on-surface">{c.text}</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {profileName(c.author_id, profiles) ?? "A comrade"} · {relativeDaysAgo(c.created_at)}
                </p>
              </div>
              {(canModerate || c.author_id === actor?.id) && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-on-surface-variant hover:text-error"
                  aria-label="Remove"
                >
                  <Icon name="close" className="text-sm" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A question or a point you want to raise…"
          className="min-w-0 flex-1"
          aria-label={`Add a question or contribution for ${item.title}`}
        />
        <Button type="submit" size="sm" variant="outline" disabled={saving || !text.trim()}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="add" />} Add
        </Button>
      </form>
    </div>
  );
}

