"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./ui";
import { post } from "@/lib/client";
import { clearDataCache } from "@/lib/hooks";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await post("/api/auth/logout", {});
      clearDataCache();
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="flex h-9 w-9 shrink-0 items-center justify-center border border-outline bg-surface text-on-surface-variant transition-colors hover:border-on-surface hover:bg-on-surface hover:text-on-primary"
      aria-label="Log out"
    >
      <Icon name={loading ? "progress_activity" : "logout"} className={loading ? "animate-spin" : ""} />
    </button>
  );
}
