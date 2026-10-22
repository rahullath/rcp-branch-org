"use client";

import { useMemo, useState } from "react";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import { del, patch } from "@/lib/client";
import type { Profile, Role } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { RowActions } from "@/components/row-actions";
import { Badge, Card, CardHeader, EmptyState, Icon } from "@/components/ui";
import { PortalCard } from "@/components/portal-card";

const ROLE_META: Record<Role, string> = {
  general_secretary: "Secretary",
  education_officer: "Education Officer",
  finance_officer: "Finance Officer",
  paper_sales_officer: "Paper Sales Officer",
  social_media_officer: "Social Media Officer",
  organizer: "Organizer",
  leading_comrade: "Leading comrade",
  member: "Member",
};

const ALL_ROLES = Object.keys(ROLE_META) as Role[];

export default function MembersPage() {
  const actor = useActor();
  const { profiles, setProfiles } = useProfiles();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  const canManage = useMemo(() => actor?.role.includes("general_secretary") ?? false, [actor]);

  async function toggleRole(profile: Profile, role: Role) {
    const has = profile.role.includes(role);
    if (has && profile.role.length === 1) return; // must keep at least one role
    const nextRoles = has ? profile.role.filter((r) => r !== role) : [...profile.role, role];

    setSaveError("");
    setSavingId(profile.id);
    const prev = profiles;
    setProfiles(prev.map((p) => (p.id === profile.id ? { ...p, role: nextRoles } : p)));
    try {
      await patch(`/api/profiles/${profile.id}`, { role: nextRoles });
    } catch (e) {
      setProfiles(prev);
      setSaveError(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setSavingId(null);
    }
  }

  async function removeMember(profile: Profile) {
    if (!window.confirm(`Remove ${profile.name} from the branch directory? This can't be undone.`)) return;
    setSaveError("");
    try {
      await del(`/api/profiles/${profile.id}`);
      setProfiles(profiles.filter((p) => p.id !== profile.id));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not remove member");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline-md text-2xl font-bold text-on-surface">Branch Members</h1>
        <p className="text-sm text-on-surface-variant">
          {canManage
            ? "Everyone in the branch, and the roles they hold. Tap a role to add or remove it."
            : "Everyone in the branch, and the roles they hold. Only the Secretary can change roles."}
        </p>
      </div>

      {saveError && <p className="text-sm font-medium text-error">{saveError}</p>}

      <PortalCard />

      {profiles.length === 0 && (
        <Card><EmptyState icon="groups" title="No members yet" /></Card>
      )}

      <Card>
        <CardHeader title="Directory" subtitle={`${profiles.length} comrades`} icon="groups" />
        <div className="divide-y divide-paper-shadow border-t border-paper-shadow">
          {profiles.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-on-surface text-xs font-bold text-on-primary">
                  {p.initials || initials(p.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{p.name}</p>
                  {/* Their email only while they haven't said who they are, and only to the GS, so they can tell who signed up. */}
                  {canManage && !p.onboarded_at && p.email && <p className="truncate text-xs text-on-surface-variant">Not set up yet · {p.email}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {canManage
                  ? ALL_ROLES.map((role) => {
                      const active = p.role.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={savingId === p.id}
                          onClick={() => toggleRole(p, role)}
                          className={cn(
                            "rounded-none border px-2 py-1 font-label-sm text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50",
                            active
                              ? "border-primary bg-primary text-on-primary"
                              : "border-outline bg-surface-container-lowest text-on-surface-variant hover:border-primary",
                          )}
                        >
                          {ROLE_META[role]}
                        </button>
                      );
                    })
                  : p.role.map((role) => (
                      <Badge key={role} tone="tertiary">
                        {ROLE_META[role] ?? role}
                      </Badge>
                    ))}
                {savingId === p.id && <Icon name="progress_activity" className="animate-spin text-on-surface-variant" />}
              </div>
              <RowActions onDelete={canManage && p.id !== actor?.id ? () => removeMember(p) : undefined} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
