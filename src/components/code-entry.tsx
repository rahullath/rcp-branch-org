"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

/**
 * "Got a code?" The code is a branch's join or viewer code; it goes to that
 * branch's invite page, on the live copy when this deployment is only the demo.
 */
export function CodeEntry({ liveUrl }: { liveUrl: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const valid = clean.length >= 4 && clean.length <= 12;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        if (liveUrl) window.location.assign(`${liveUrl}/join/${clean}`);
        else router.push(`/join/${clean}`);
      }}
    >
      <label className="block text-sm font-semibold text-on-surface" htmlFor="join-code">
        Got a code from a comrade?
      </label>
      <Input
        id="join-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="e.g. AB12CD"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={16}
      />
      <Button type="submit" className="w-full" disabled={!valid}>
        Go to my branch
      </Button>
    </form>
  );
}
