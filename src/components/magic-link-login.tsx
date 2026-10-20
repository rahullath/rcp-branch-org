"use client";

import { useState } from "react";
import { post } from "@/lib/client";
import { Button, Input, Spinner } from "@/components/ui";

export function MagicLinkLogin({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      if (withPassword) {
        await post("/api/auth/password", { email, password });
        // A full load, so the server sees the new session.
        window.location.replace(next || "/home");
        return;
      }
      await post("/api/auth/otp", { email, next });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-2 text-sm text-on-surface">
        <p>
          Sign-in link sent to <span className="font-semibold">{email}</span>. Open it on this phone.
        </p>
        <p className="text-on-surface-variant">
          Not there after a minute? Check <span className="font-semibold">Spam</span> or <span className="font-semibold">Promotions</span>. If it&apos;s in Spam, tap{" "}
          <span className="font-semibold">Not spam</span> so the next ones arrive properly.
        </p>
        <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setSent(false)}>
          Send it again or use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="text-sm text-on-surface-variant">
        Sign in with the magic link sent to your email. Use the email address your branch has on file.
      </p>
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.org"
        required
        autoFocus
      />
      {withPassword && (
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" required autoComplete="current-password" />
      )}
      <Button type="submit" className="w-full" disabled={sending}>
        {sending ? <Spinner className="h-4 w-4" /> : withPassword ? "Sign in" : "Email me a sign-in link"}
      </Button>
      {error && <p className="text-sm font-medium text-error">{error}</p>}
      <button type="button" className="text-xs text-on-surface-variant underline" onClick={() => (setWithPassword((v) => !v), setError(""))}>
        {withPassword ? "Email me a link instead" : "I have a password"}
      </button>
    </form>
  );
}
