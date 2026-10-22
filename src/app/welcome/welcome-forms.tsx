"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export function WelcomeForms({ code: invited }: { code: string }) {
  const router = useRouter();
  const [code, setCode] = useState(invited);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(body: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      await post("/api/branches", body);
      // Then onboarding: who you are, your role, the app on your phone.
      router.replace("/onboarding");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that");
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="ask stack6"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void go({ action: "join", code: code.trim() });
        }}
      >
        <span className="ask-k">Join your branch</span>
        <p className="small" style={{ margin: 0 }}>{invited ? "Your invite's code is filled in — tap Join." : "Ask a comrade in your branch for its code — it's in their Profile."}</p>
        <input className="inp" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Branch code, e.g. E69501" aria-label="Branch code" maxLength={12} autoCapitalize="characters" />
        <button type="submit" className="btn btn-p" disabled={busy || !code.trim()}>
          Join
        </button>
      </form>

      <form
        className="ask stack6"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void go({ action: "create", name: name.trim(), district: district.trim() });
        }}
      >
        <span className="ask-k">Or start your branch on the app</span>
        <p className="small" style={{ margin: 0 }}>You&apos;ll be its secretary and get a code to invite the rest. It starts empty — you add your own events, people and plans.</p>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Branch name, e.g. Leeds Branch 1" aria-label="Branch name" maxLength={80} />
        <input className="inp" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="City or district, e.g. Leeds" aria-label="City or district" maxLength={60} />
        <button type="submit" className="btn btn-o" disabled={busy || !name.trim()}>
          Start the branch
        </button>
      </form>
      {error && <p className="small red">{error}</p>}
    </>
  );
}
