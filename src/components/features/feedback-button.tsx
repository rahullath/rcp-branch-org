"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";

/** "Something's off" from any screen — opens Feedback with this page filled in. */
export function FeedbackButton({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/feedback") return null;
  const href = `/feedback?from=${encodeURIComponent(pathname)}`;
  return wide ? (
    <Link href={href} className="flex items-center gap-2 border border-paper-shadow px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary">
      <MessageSquareWarning size={16} /> Feedback on this page
    </Link>
  ) : (
    <Link href={href} aria-label="Feedback on this page" className="flex h-8 w-8 items-center justify-center bg-on-surface/20 text-on-primary">
      <MessageSquareWarning size={17} />
    </Link>
  );
}
