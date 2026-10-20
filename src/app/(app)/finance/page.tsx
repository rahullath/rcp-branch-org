"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import {
  TRANSACTION_CATEGORY_LABELS,
  type Comrade,
  type Pledge,
  type Profile,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { hasAnyRole } from "@/lib/permissions";
import { PORTAL_URL } from "@/lib/identity";
import { RowActions } from "@/components/row-actions";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";

type PledgeRow = Pledge & { user_name?: string };

export default function FinancePage() {
  const { data: transactions, loading, setData: setTxs } = useData<Transaction[]>("/api/finance/transactions");
  const { data: pledges, refresh: refreshPledges, setData: setPledges } = useData<PledgeRow[]>("/api/finance/pledges");
  // Totals for everyone; the rows themselves are only yours unless you're an officer.
  const { data: levy } = useData<{ pledged: number; paid: number; people: number }>("/api/finance/pledges/totals");
  const { profiles } = useProfiles();
  const actor = useActor();
  const canEdit = hasAnyRole(actor, "finance_officer", "general_secretary");
  const isGs = hasAnyRole(actor, "general_secretary");
  const [showTx, setShowTx] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showPledge, setShowPledge] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const totals = useMemo(() => {
    const txs = transactions ?? [];
    const income = txs.filter((t) => t.type === "sale").reduce((s, t) => s + Math.abs(t.amount), 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
    const balance = income - expense;
    const pledgesTotal = levy?.paid ?? (pledges ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    return { income, expense, balance, pledgesTotal };
  }, [transactions, pledges, levy]);

  const members = useMemo(() => (profiles ?? []).filter((p) => p.id !== "demo-user"), [profiles]);

  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const noApp = (comrades ?? []).filter((c) => !c.profile_id);
  const pledgeName = (p: PledgeRow) =>
    p.user_id ? (members.find((m) => m.id === p.user_id)?.name ?? p.user_name ?? "Comrade") : ((comrades ?? []).find((c) => c.id === p.comrade_id)?.name ?? "Someone");
  const pledged = levy?.pledged ?? (pledges ?? []).reduce((n, p) => n + p.amount, 0);
  const seesAll = !!actor?.role.some((r) => r !== "member");

  async function addTx(input: { amount: number; type: TransactionType; description: string }) {
    const created = await post<Transaction>("/api/finance/transactions", input);
    setTxs([created, ...(transactions ?? [])]);
    setShowTx(false);
  }

  async function addBulkSales(rows: { amount: number; category: TransactionCategory; description: string }[]) {
    const created: Transaction[] = [];
    for (const row of rows) {
      created.push(
        await post<Transaction>("/api/finance/transactions", {
          amount: row.amount,
          type: "sale",
          category: row.category,
          description: row.description,
        }),
      );
    }
    setTxs([...created.reverse(), ...(transactions ?? [])]);
    setShowBulk(false);
  }

  async function addPledge(input: { user_id?: string; comrade_id?: string; amount: number }) {
    const created = await post<PledgeRow>("/api/finance/pledges", input);
    setPledges([created, ...(pledges ?? [])]);
    setShowPledge(false);
  }

  async function markPaid(pledge: PledgeRow) {
    const updated = await patch<PledgeRow>(`/api/finance/pledges/${pledge.id}`, {
      status: "paid",
      paid_at: new Date().toISOString().slice(0, 10),
    });
    setPledges((pledges ?? []).map((p) => (p.id === updated.id ? { ...updated, user_name: p.user_name } : p)));
    refreshPledges();
  }

  async function saveTx(id: string, input: Partial<Transaction>) {
    const updated = await patch<Transaction>(`/api/finance/transactions/${id}`, input);
    setTxs((transactions ?? []).map((t) => (t.id === updated.id ? updated : t)));
    setEditingTx(null);
  }

  async function removeTx(tx: Transaction) {
    if (!window.confirm(`Delete this ${tx.type === "sale" ? "income" : "expense"} of £${tx.amount.toFixed(2)}?`)) return;
    await del(`/api/finance/transactions/${tx.id}`);
    setTxs((transactions ?? []).filter((t) => t.id !== tx.id));
  }

  async function removePledge(pledge: PledgeRow) {
    if (!window.confirm(`Delete this £${pledge.amount} pledge?`)) return;
    await del(`/api/finance/pledges/${pledge.id}`);
    setPledges((pledges ?? []).filter((p) => p.id !== pledge.id));
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-2xl font-bold text-on-surface">Finance</h1>
          <p className="text-sm text-on-surface-variant">Branch funds, dues, and the branch levy.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowPledge(true)}>
              <Icon name="handshake" /> Branch levy
            </Button>
            <Button variant="outline" onClick={() => setShowBulk(true)}>
              <Icon name="add" /> Bulk sale entry
            </Button>
            <Button onClick={() => setShowTx(true)}>
              <Icon name="add" /> Record
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Balance", value: `£${totals.balance.toFixed(2)}`, tone: totals.balance >= 0 ? "text-tertiary" : "text-error" },
          { label: "Income", value: `£${totals.income.toFixed(2)}`, tone: "text-tertiary" },
          { label: "Expenses", value: `£${totals.expense.toFixed(2)}`, tone: "text-on-surface" },
          { label: "Pledges paid", value: `£${totals.pledgesTotal.toFixed(2)}`, tone: "text-on-surface" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">{s.label}</p>
            <p className={cn("mt-1 font-headline-md text-xl font-bold", s.tone)}>{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent transactions" icon="receipt_long" />
          <div className="px-5 pb-5">
            {(transactions ?? []).length === 0 && (
              <EmptyState icon="receipt_long" title="No transactions yet" />
            )}
            <div className="space-y-2">
              {(transactions ?? []).slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-none border border-paper-shadow bg-surface-container-lowest p-3">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-none", t.type === "sale" ? "bg-on-surface text-on-primary" : "bg-error-container text-on-error-container")}>
                    <Icon name={t.type === "sale" ? "trending_up" : "trending_down"} className="text-base" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{t.description || (t.type === "sale" ? "Sale" : "Expense")}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(t.created_at)}</p>
                  </div>
                  <span className={cn("font-label-md font-bold", t.type === "sale" ? "text-tertiary" : "text-error")}>
                    {t.type === "sale" ? "+" : "−"}£{Math.abs(t.amount).toFixed(2)}
                  </span>
                  <RowActions
                    onEdit={canEdit ? () => setEditingTx(t) : undefined}
                    onDelete={isGs ? () => removeTx(t) : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Branch levy" subtitle={seesAll ? undefined : "Only you and the officers see your pledge"} icon="account_balance_wallet" />
          <div className="px-5 pb-5">
            <div className="space-y-2">
              {(pledges ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-none border border-paper-shadow bg-surface-container-lowest p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{pledgeName(p)}</p>
                    <p className="text-xs text-on-surface-variant">{p.user_id ? "Pledged" : "Pledged · not on the app"}</p>
                  </div>
                  {p.status === "paid" ? (
                    <Badge tone="success">Paid £{p.amount}</Badge>
                  ) : canEdit ? (
                    <button onClick={() => markPaid(p)} className="rounded-none border border-outline px-3 py-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:border-tertiary hover:text-tertiary">
                      Owe £{p.amount}
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-on-surface-variant">£{p.amount}</span>
                  )}
                  <RowActions onDelete={isGs ? () => removePledge(p) : undefined} />
                </div>
              ))}
              {(pledges ?? []).length === 0 && <EmptyState icon="handshake" title={seesAll ? "No levy pledges yet" : "You haven't pledged yet"} hint={seesAll ? undefined : "Tell the finance officer what you can give."} />}
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">
              Branch: £{pledged.toFixed(0)} pledged{levy ? ` by ${levy.people}` : ""} · £{totals.pledgesTotal.toFixed(0)} paid. Monthly subs and paper/IDOM subscriptions are on{" "}
              <a className="font-semibold text-primary underline" href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
                the party portal
              </a>
              , not here.
            </p>
          </div>
        </Card>
      </div>

      {showTx && (
        <AddTxModal
          onClose={() => setShowTx(false)}
          onAdd={addTx}
        />
      )}
      {editingTx && (
        <AddTxModal
          tx={editingTx}
          onClose={() => setEditingTx(null)}
          onAdd={(input) => saveTx(editingTx.id, input)}
        />
      )}
      {showPledge && (
        <AddPledgeModal
          members={members}
          noApp={noApp}
          onClose={() => setShowPledge(false)}
          onAdd={addPledge}
        />
      )}
      {showBulk && <BulkSaleModal onClose={() => setShowBulk(false)} onAdd={addBulkSales} />}
    </div>
  );
}

function AddTxModal({
  tx,
  onClose,
  onAdd,
}: {
  tx?: Transaction;
  onClose: () => void;
  onAdd: (input: { amount: number; type: TransactionType; description: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [type, setType] = useState<TransactionType>(tx?.type ?? "sale");
  const [description, setDescription] = useState(tx?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a valid amount");
    setSaving(true);
    setError("");
    try {
      await onAdd({ amount: n, type, description });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tx ? "Edit transaction" : "Record transaction"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              <option value="sale">Income / sale</option>
              <option value="expense">Expense</option>
            </Select>
          </Field>
          <Field label="Amount (£)">
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" required />
          </Field>
        </div>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Paper sale takings" />
        </Field>
        {error && <p className="text-sm font-medium text-error">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" />} Save
        </Button>
      </form>
    </Modal>
  );
}

function AddPledgeModal({
  members,
  noApp,
  onClose,
  onAdd,
}: {
  members: Profile[];
  noApp: Comrade[];
  onClose: () => void;
  onAdd: (input: { user_id?: string; comrade_id?: string; amount: number }) => Promise<void>;
}) {
  const [userId, setUserId] = useState(members[0] ? `p:${members[0].id}` : "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a valid amount");
    setSaving(true);
    setError("");
    try {
      const [kind, id] = userId.split(":");
      await onAdd({ ...(kind === "p" ? { user_id: id } : { comrade_id: id }), amount: n });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add branch levy">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Comrade">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
            {members.map((m) => (
              <option key={m.id} value={`p:${m.id}`}>{m.name}</option>
            ))}
            {noApp.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>{c.name} (not on the app)</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (£)">
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20.00" required />
        </Field>
        {error && <p className="text-sm font-medium text-error">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" />} Save levy
        </Button>
      </form>
    </Modal>
  );
}

interface BulkRowState {
  category: TransactionCategory;
  preset: "2" | "5" | "custom";
  customAmount: string;
  qty: string;
}

function emptyBulkRow(): BulkRowState {
  return { category: "paper", preset: "2", customAmount: "", qty: "1" };
}

function BulkSaleModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (rows: { amount: number; category: TransactionCategory; description: string }[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<BulkRowState[]>([emptyBulkRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateRow(i: number, patch: Partial<BulkRowState>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const parsedRows = rows.map((r) => {
    const unit = r.preset === "custom" ? parseFloat(r.customAmount) : Number(r.preset);
    const qty = Math.max(1, parseInt(r.qty, 10) || 1);
    return { unit, qty, amount: unit * qty, category: r.category };
  });
  const total = parsedRows.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedRows.some((p) => !Number.isFinite(p.unit) || p.unit <= 0)) {
      setError("Enter a valid amount for every row");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd(
        parsedRows.map((p) => ({
          amount: p.amount,
          category: p.category,
          description: `${TRANSACTION_CATEGORY_LABELS[p.category]} × ${p.qty} @ £${p.unit.toFixed(2)}`,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Bulk sale entry">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="space-y-2 border border-paper-shadow p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-on-surface-variant">Row {i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-error">
                    <Icon name="close" className="text-sm" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Category">
                  <Select value={row.category} onChange={(e) => updateRow(i, { category: e.target.value as TransactionCategory })}>
                    {(Object.keys(TRANSACTION_CATEGORY_LABELS) as TransactionCategory[]).map((k) => (
                      <option key={k} value={k}>{TRANSACTION_CATEGORY_LABELS[k]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Price">
                  <Select value={row.preset} onChange={(e) => updateRow(i, { preset: e.target.value as BulkRowState["preset"] })}>
                    <option value="2">£2</option>
                    <option value="5">£5 (solidarity)</option>
                    <option value="custom">Custom</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {row.preset === "custom" && (
                  <Field label="Amount (£)">
                    <Input type="number" step="0.01" min="0" value={row.customAmount} onChange={(e) => updateRow(i, { customAmount: e.target.value })} placeholder="3.50" />
                  </Field>
                )}
                <Field label="Qty">
                  <Input type="number" min="1" step="1" value={row.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setRows([...rows, emptyBulkRow()])}>
          <Icon name="add" /> Add row
        </Button>
        <p className="text-right text-sm font-bold text-on-surface">Total: £{total.toFixed(2)}</p>
        {error && <p className="text-sm font-medium text-error">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Icon name="check" />} Save {rows.length} {rows.length === 1 ? "sale" : "sales"}
        </Button>
      </form>
    </Modal>
  );
}
