import type { Actor } from "./auth";
import { IMPORT_VERIFIERS, type ImportKind, type Role } from "./types";

/**
 * Client-side mirror of `requireOwnerOrRole` (src/lib/api.ts) — must stay
 * logically identical, or the UI will show an Edit/Delete button that then
 * 403s. general_secretary always passes, same as the server check.
 */
export function canManage(actor: Actor | null, creatorId: string | null | undefined, ...roles: Role[]): boolean {
  if (!actor) return false;
  const isOwner = creatorId != null && actor.id === creatorId;
  const hasRole = roles.some((r) => actor.role.includes(r)) || actor.role.includes("general_secretary");
  return isOwner || hasRole;
}

/**
 * Client-side mirror of a plain `requireRole` check (no ownership branch,
 * no implicit GS bypass — pass "general_secretary" explicitly if the
 * matching server route's requireRole(...) call does, same as every
 * current usage in this codebase).
 */
export function hasAnyRole(actor: Actor | null, ...roles: Role[]): boolean {
  if (!actor) return false;
  return roles.some((r) => actor.role.includes(r));
}

/**
 * Who verifies a given import kind: general_secretary always passes,
 * everyone else per IMPORT_VERIFIERS.
 * Mirrored server-side by the `import_rows` "verifier update" RLS policy —
 * keep both in sync if the matrix changes.
 */
export function canVerifyImportRow(actor: Actor | null, kind: ImportKind): boolean {
  if (!actor) return false;
  if (actor.role.includes("general_secretary")) return true;
  return IMPORT_VERIFIERS[kind].some((r) => actor.role.includes(r));
}

/**
 * Who runs an event: its lead, whoever posted it, an organizer or the GS.
 * They post updates, edit the bring list and roles, and send the extra
 * reminder. Used by both the API and the UI.
 */
export function canRunEvent(
  actor: Actor | null,
  event: { lead_id?: string | null; posted_by?: string | null },
): boolean {
  if (!actor) return false;
  if (actor.id === event.lead_id || actor.id === event.posted_by) return true;
  return actor.role.includes("organizer") || actor.role.includes("general_secretary");
}
