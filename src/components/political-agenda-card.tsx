"use client";

import { useState } from "react";
import type { useActor } from "@/lib/actor-context";
import type { AgendaContribution, AgendaItem, Profile } from "@/lib/types";
import { relativeDaysAgo } from "@/lib/utils";
import { Badge, Button, Card, Icon, Input, Spinner } from "@/components/ui";

function profileName(id: string | null | undefined, profiles: Profile[]): string | null {
  return id ? (profiles.find((p) => p.id === id)?.name ?? null) : null;
}

const POLITICAL = "Political Discussion";


/** Read-only view of a political agenda item plus the same open
 * "Questions & contributions" as the Agenda page — this is what a shared
 * event link should actually show, not just the bare event card. */
export function PoliticalAgendaCard({
  item,
  contributions,
  profiles,
  actor,
  onAddContribution,
  onDeleteContribution,
  hidePrep = false,
}: {
  /** On the event page the prep shows once, in "Read or listen before". */
  hidePrep?: boolean;
  item: AgendaItem;
  contributions: AgendaContribution[];
  profiles: Profile[];
  actor: ReturnType<typeof useActor>;
  onAddContribution: (text: string) => Promise<void>;
  onDeleteContribution: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onAddContribution(text.trim());
      setText("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{POLITICAL}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h3 className="font-label-md font-bold text-on-surface">{item.title}</h3>
        {item.duration && <Badge tone="neutral">{item.duration} min</Badge>}
      </div>
      {item.leadoff_name && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-on-surface">
          <Icon name="mic" className="text-sm text-primary" /> Leadoff: {item.leadoff_name}
        </p>
      )}
      {item.description && <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>}

      {!hidePrep && (item.prep_links ?? []).length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Read or listen before</p>
          <ul className="mt-1 space-y-1">
            {(item.prep_links ?? []).map((l, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5 text-sm">
                <Icon name="link" className="shrink-0 text-sm text-primary" />
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-primary underline" title={l.url}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                {(c.author_id === actor?.id || actor?.role.includes("education_officer") || actor?.role.includes("general_secretary")) && (
                  <button
                    type="button"
                    onClick={() => onDeleteContribution(c.id)}
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
    </Card>
  );
}
