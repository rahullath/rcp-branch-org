import { getActor, type Actor } from "./auth";
import type { Role } from "./types";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return json({ error: message }, { status: 404 });
}

export function serverError(error: unknown) {
  // A write the database refused: say so instead of "Internal error".
  if (error instanceof Error && /row-level security/i.test(error.message)) {
    return json({ error: "You can't change that from this account" }, { status: 403 });
  }
  console.error("[api]", error);
  return json({ error: "Internal error" }, { status: 500 });
}

export type WithActor =
  | { actor: Actor; error: null }
  | { actor: null; error: Response };

export async function withActor(): Promise<WithActor> {
  const actor = await getActor();
  if (!actor) return { actor: null, error: json({ error: "Unauthorized" }, { status: 401 }) };
  return { actor, error: null };
}

/** Like withActor, but also requires the actor to hold at least one of the given roles. */
export async function requireRole(...roles: Role[]): Promise<WithActor> {
  const result = await withActor();
  if (result.error) return result;
  if (!roles.some((r) => result.actor.role.includes(r))) {
    return {
      actor: null,
      error: json({ error: `Forbidden — requires ${roles.join(" or ")}` }, { status: 403 }),
    };
  }
  return result;
}

/**
 * Like requireRole, but also allows the resource's creator through
 * regardless of role. general_secretary always passes. Callers fetch the
 * resource first to get `creatorId`.
 */
export async function requireOwnerOrRole(creatorId: string | null | undefined, ...roles: Role[]): Promise<WithActor> {
  const result = await withActor();
  if (result.error) return result;
  const isOwner = creatorId != null && result.actor.id === creatorId;
  const hasRole = roles.some((r) => result.actor.role.includes(r)) || result.actor.role.includes("general_secretary");
  if (!isOwner && !hasRole) {
    return {
      actor: null,
      error: json(
        { error: `Forbidden — requires ${roles.join(" or ")}, general_secretary, or ownership` },
        { status: 403 },
      ),
    };
  }
  return result;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isDemoActor(actor: Actor) {
  return actor.isDemo;
}
