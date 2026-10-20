"use client";

import { useEffect, useState } from "react";
import { Button, Icon } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Slim "install the app" banner. On Android/desktop it hooks the
 * `beforeinstallprompt` event and offers a real install button; on iOS
 * Safari (which has no such event) it just explains the Share → Add to
 * Home Screen dance. Dismissed once stored so it never comes back.
 */
export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const isStandaloneIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(navigator as unknown as { standalone?: boolean }).standalone;
    let frame: number | undefined;
    if (isStandaloneIOS) {
      frame = requestAnimationFrame(() => setIsIOS(true));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);

  if (dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;
  const isIosHint = isIOS && !deferredPrompt;

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    }
    setDismissed(true);
  }

  return (
    <div className="mb-6 flex items-center gap-3 border border-primary/40 bg-primary/5 px-4 py-3">
      <Icon name="download" className="shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-on-surface">
        {isIosHint ? (
          <>Install the Branch Organizer — tap <span className="font-semibold">Share</span> then <span className="font-semibold">Add to Home Screen</span>.</>
        ) : (
          <>Install this app on your phone so it opens like a real app.</>
        )}
      </p>
      <Button size="sm" variant="outline" onClick={install}>
        {isIosHint ? "Got it" : "Install"}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss install banner"
        className="shrink-0 p-1 text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}