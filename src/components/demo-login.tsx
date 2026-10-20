"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Profile } from "@/lib/types";
import { initials } from "@/lib/utils";
import { post } from "@/lib/client";
import { clearDataCache } from "@/lib/hooks";
import { Button, Input, Spinner, Icon } from "@/components/ui";

export function DemoLogin({ profiles }: { profiles: Profile[] }) {
  return (
    <Suspense fallback={null}>
      <DemoLoginInner profiles={profiles} />
    </Suspense>
  );
}

function DemoLoginInner({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showOtps, setShowOtps] = useState(false);
  const [email, setEmail] = useState("");

  async function login(id: string) {
    setBusyId(id);
    setError("");
    try {
      await post("/api/auth/demo", { userId: id });
      clearDataCache();
      router.push(searchParams.get("next") || "/home");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-headline-sm text-xs font-bold uppercase tracking-wider text-on-surface">Continue as a comrade</p>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Demo mode</span>
      </div>

      <div className="space-y-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => login(p.id)}
            disabled={busyId !== null}
            className="flex w-full items-center gap-3 rounded-none border border-paper-shadow bg-surface-container-lowest px-3 py-2.5 text-left transition hover:border-primary hover:bg-surface-container-low active-press"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-on-surface text-xs font-bold text-on-primary">
              {initials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-on-surface">{p.name}</span>
              <span className="block truncate text-xs capitalize text-on-surface-variant">
                {p.role.join(", ").replace(/_/g, " ")}
              </span>
            </span>
            {busyId === p.id ? <Spinner className="h-4 w-4" /> : <Icon name="chevron_right" className="text-on-surface-variant" />}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-paper-shadow" />
        <button
          onClick={() => setShowOtps((s) => !s)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {showOtps ? "Hide" : "Sign in with magic link"}
        </button>
        <span className="h-px flex-1 bg-paper-shadow" />
      </div>

      {showOtps && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await post("/api/auth/otp", { email });
              setShowOtps(false);
              setEmail("");
              setError("Magic link sent — check your inbox.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not send link");
            }
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.org"
            required
          />
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>
      )}

      {error && <p className="text-sm font-medium text-error">{error}</p>}
    </div>
  );
}
