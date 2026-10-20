"use client";

import { useState } from "react";
import type { Material, MaterialCategory } from "@/lib/types";
import { Button, Field, Icon, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { HolderPicker, holderFields, holderValue } from "@/components/v2/holder-picker";

export const PURPOSES = ["Branch programme", "Paper stall", "Good to have"] as const;

/** Add / edit an item: what it is, how many, who has it (on the app or not), and how many to order. */
export function AddMaterialModal({
  material,
  onClose,
  onAdd,
}: {
  material?: Material;
  onClose: () => void;
  onAdd: (input: Partial<Material> & { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(material?.name ?? "");
  const [category, setCategory] = useState<MaterialCategory>(material?.category ?? "gear");
  const [qty, setQty] = useState(String(material?.qty ?? 1));
  const [holder, setHolder] = useState(material ? holderValue(material) : "");
  const [place, setPlace] = useState(material?.holder_label && material.holder_label !== "Branch cupboard" ? material.holder_label : "");
  const [wanted, setWanted] = useState(String(material?.wanted ?? 0));
  const [purpose, setPurpose] = useState(material?.purpose ?? "");
  const [note, setNote] = useState(material?.note ?? material?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const h = holderFields(holder);
    try {
      await onAdd({
        name,
        category,
        qty: Math.max(0, parseInt(qty) || 0),
        ...h,
        holder_label: place.trim() || (h.holder_id || h.holder_comrade_id ? null : "Branch cupboard"),
        status: material?.status === "missing" ? "missing" : h.holder_id || h.holder_comrade_id ? "in_use" : "available",
        wanted: Math.max(0, parseInt(wanted) || 0),
        purpose: purpose || null,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={material ? "Edit item" : "Add item"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Megaphone, What is Marxism?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)}>
              <option value="gear">Gear</option>
              <option value="book">Book</option>
              <option value="literature">Pamphlet / IDOM / paper</option>
            </Select>
          </Field>
          <Field label="How many we have">
            <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <Field label="Who has it">
          <HolderPicker className="w-full border border-outline bg-white px-3 py-2 text-sm" value={holder} onChange={setHolder} />
        </Field>
        <Field label="Where (optional)">
          <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. District bookshelf, Ana's car" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="To order">
            <Input type="number" min="0" value={wanted} onChange={(e) => setWanted(e.target.value)} />
          </Field>
          <Field label="For">
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              <option value="">—</option>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, who it's promised to, issue date…" />
        </Field>
        {error && <p className="text-sm font-medium text-error">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name={material ? "save" : "add"} />} {material ? "Save item" : "Add item"}
        </Button>
      </form>
    </Modal>
  );
}
