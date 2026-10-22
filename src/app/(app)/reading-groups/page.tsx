"use client";

import { ReadingGroupsSection } from "@/components/features/reading-groups";

/** Reading groups on their own — the same section Education shows. */
export default function ReadingGroupsPage() {
  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Reading groups</h1>
          <p className="sub">What each group reads, when, where, and who it&apos;s for.</p>
        </div>
      </div>
      <ReadingGroupsSection />
    </div>
  );
}
