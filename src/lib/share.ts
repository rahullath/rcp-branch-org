/**
 * Share via the phone's native share sheet (WhatsApp is one tap from there —
 * that's where the branch actually talks), falling back to the clipboard on
 * desktop. Resolves to what happened so the caller can show feedback.
 */
export async function shareOrCopy(payload: { title?: string; text: string; url?: string }): Promise<"shared" | "copied" | "failed"> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav) return "failed";
  if (typeof nav.share === "function" && /Android|iPhone|iPad|iPod/i.test(nav.userAgent)) {
    try {
      await nav.share(payload);
      return "shared";
    } catch (e) {
      // User dismissing the sheet is not an error — don't fall through to a surprise copy.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  try {
    await nav.clipboard.writeText(payload.url ? `${payload.text}\n${payload.url}` : payload.text);
    return "copied";
  } catch {
    return "failed";
  }
}
