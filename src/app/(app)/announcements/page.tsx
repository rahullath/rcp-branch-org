"use client";

import { AnnouncementSection } from "@/components/features/announcements";

/** Every announcement for the branch. Officers add, edit and remove them; everyone can read them here after hiding them from Home. */
export default function AnnouncementsPage() {
  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Announcements</h1>
          <p className="sub">What the branch wants you to know.</p>
        </div>
      </div>
      <AnnouncementSection title="Announcements" emptyHint="Nothing posted right now." />
    </div>
  );
}
