"use client";

import { ExternalLink } from "lucide-react";
import { festivalDates } from "@/lib/festival";
import { useFestival } from "@/lib/festival-config";
import { FestivalDetails } from "@/components/features/festival-details";

/** The festival's details, as an admin has set them. Add a timetable or notices as a copy needs them. */
export default function FestivalPage() {
  const { festival, loading } = useFestival();
  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>{festival?.name ?? "Festival"}</h1>
          <p className="sub">{festival ? `${festivalDates(festival)}${festival.location ? ` · ${festival.location}` : ""}` : loading ? "Loading…" : "No festival is set up yet."}</p>
        </div>
      </div>
      {festival?.url && (
        <a className="linkcard" href={festival.url} target="_blank" rel="noopener noreferrer">
          <span className="lc-k">Tickets and information</span>
          <span className="t">{festival.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          <ExternalLink size={16} strokeWidth={2.25} className="chev" />
        </a>
      )}
      <FestivalDetails festival={festival} />
    </div>
  );
}
