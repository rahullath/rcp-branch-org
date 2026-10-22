"use client";

import { useState } from "react";
import { useActor } from "@/lib/actor-context";
import { EVENT_SCOPE_LABEL, MEETING_EVENT_TYPES, type Event, type EventScope, type EventType } from "@/lib/types";
import { PersonPicker } from "@/components/person-picker";
import { LocationInput } from "@/components/location-input";
import { Modal, Spinner } from "@/components/ui";

/** The types, in the order people reach for them. */
const TYPES: { value: EventType; label: string; title: string }[] = [
  { value: "branch", label: "Branch meeting", title: "The topic, e.g. Reform or Revolution" },
  { value: "open_meeting", label: "Open meeting", title: "e.g. Why are young people turning to communism?" },
  { value: "paper_sale", label: "Paper sale", title: "e.g. Saturday paper sale" },
  { value: "uni_stall", label: "Uni stall", title: "e.g. Guild stall" },
  { value: "reading_group", label: "Reading group", title: "e.g. Wage Labour and Capital, part 2" },
  { value: "social", label: "Social", title: "e.g. Pub after branch" },
  { value: "mobilization", label: "Demo / mobilisation", title: "e.g. National Palestine demo" },
  { value: "postering", label: "Postering", title: "e.g. Postering, Selly Oak" },
  { value: "phonebank", label: "Phone banking", title: "e.g. Calling this week's contacts" },
  { value: "committee", label: "Branch committee", title: "e.g. BC" },
  { value: "one_on_one", label: "1-on-1", title: "e.g. Coffee with Ana" },
];

/** The same types in three groups, so eleven chips read as three small choices. */
const TYPE_GROUPS: { title: string; types: EventType[] }[] = [
  { title: "Meetings", types: ["branch", "open_meeting", "reading_group", "committee", "one_on_one"] },
  { title: "Out and about", types: ["paper_sale", "uni_stall", "mobilization", "postering", "phonebank"] },
  { title: "Social", types: ["social"] },
];

/** Sales, stalls and demos have a meet-up before the start. */
const MEETUP_TYPES: EventType[] = ["paper_sale", "uni_stall", "mobilization", "postering"];

/** Easy drop-ins to invite contacts to: someone's there for a couple of hours, people come and chat. */
const SOCIAL_PRESETS = [
  { title: "Coffee with the communists", time: "16:00", location: "", description: "Drop in any time 4–6pm for a coffee and a chat about communism." },
  { title: "Meet the communists at the pub", time: "16:00", location: "Joe's", description: "Drop in any time 4–6pm for a drink and a chat." },
];

/**
 * New / edit event — shared by the Events list and the event page. The type
 * comes first and decides what else is asked: chair and minutes for
 * meetings, issue and copies for a paper sale, a meet-up time for stalls.
 * Everything optional sits under "More".
 */
export function EventModal({
  event,
  preset,
  onClose,
  onSave,
}: {
  event?: Event;
  /** Starting values for a new event, e.g. a paper sale at a chosen spot. */
  preset?: Partial<Event>;
  onClose: () => void;
  onSave: (input: Partial<Event> & { title?: string }) => Promise<void>;
}) {
  const actor = useActor();
  // A preset time comes from "best times" on Paper sales.
  const start0 = event ? splitLocal(event.start_time) : preset?.start_time ? splitLocal(preset.start_time) : null;
  const [eventType, setEventType] = useState<EventType>(event?.event_type ?? preset?.event_type ?? "branch");
  const [title, setTitle] = useState(event?.title ?? preset?.title ?? "");
  const [day, setDay] = useState(start0?.day ?? "");
  const [time, setTime] = useState(start0?.time ?? "18:30");
  const [meetup, setMeetup] = useState(event?.meetup_time ? splitLocal(event.meetup_time).time : "");
  const [location, setLocation] = useState(event?.location ?? preset?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [leadId, setLeadId] = useState<string | null>(event?.lead_id ?? event?.posted_by ?? actor?.id ?? null);
  const [chairId, setChairId] = useState<string | null>(event?.chair_id ?? null);
  const [minutesId, setMinutesId] = useState<string | null>(event?.minutes_id ?? null);
  const [target, setTarget] = useState(event?.target ? String(event.target) : "");
  const [confirmBy, setConfirmBy] = useState(event?.confirm_by ? toLocalInput(event.confirm_by) : "");
  const [paperIssue, setPaperIssue] = useState(event?.paper_issue ?? preset?.paper_issue ?? "");
  const [copiesOut, setCopiesOut] = useState(event?.copies_out != null ? String(event.copies_out) : "");
  const [scope, setScope] = useState<EventScope>(event?.scope ?? "branch");
  const [isMobilization, setIsMobilization] = useState(event?.is_mobilization ?? false);
  const [more, setMore] = useState(!!(event?.target || event?.description || (event?.scope && event.scope !== "branch")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isMeeting = MEETING_EVENT_TYPES.includes(eventType);
  const hasMeetup = MEETUP_TYPES.includes(eventType);
  const type = TYPES.find((t) => t.value === eventType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!day) return setError("Pick a day");
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: title.trim() || type?.label || "Event",
        event_type: eventType,
        start_time: new Date(`${day}T${time || "18:00"}`).toISOString(),
        location,
        description: description || undefined,
        is_mobilization: isMobilization || eventType === "mobilization",
        meetup_time: meetup && hasMeetup ? new Date(`${day}T${meetup}`).toISOString() : undefined,
        chair_id: isMeeting ? chairId : null,
        minutes_id: isMeeting ? minutesId : null,
        lead_id: leadId,
        target: target ? Math.max(0, parseInt(target) || 0) || null : null,
        // A number plus a deadline makes it tentative until it's reached (or the lead calls it).
        confirm_by: target && confirmBy ? new Date(confirmBy).toISOString() : null,
        scope: isMeeting ? "branch" : scope,
        ...(eventType === "paper_sale" ? { paper_issue: paperIssue.trim() || null, copies_out: copiesOut ? Math.max(0, parseInt(copiesOut) || 0) : null } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={event ? "Edit event" : "New event"}>
      <form onSubmit={submit} className="v2 stack8">
        <div className="fld">
          <span>What kind</span>
          <div role="radiogroup" aria-label="Event type" className="stack6">
            {TYPE_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="small" style={{ margin: "0 0 4px" }}>
                  {g.title}
                </p>
                <div className="row gap6 wrap">
                  {g.types.map((v) => {
                    const t = TYPES.find((x) => x.value === v)!;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={eventType === t.value}
                        className="lchip big"
                        style={eventType === t.value ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
                        onClick={() => setEventType(t.value)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {eventType === "social" && !event && (
            <div className="row gap6 wrap">
              <span className="small">Try:</span>
              {SOCIAL_PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  className="link small"
                  onClick={() => {
                    setTitle(p.title);
                    setTime(p.time);
                    if (p.location) setLocation(p.location);
                    setDescription(p.description);
                    setMore(true);
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
          {eventType === "committee" && (
            <p className="small" style={{ margin: 0 }}>
              Only officers see it. Invite a comrade to it from the event page.
            </p>
          )}
        </div>

        <div className="fgrid">
          <label className="fld">
            <span>{eventType === "branch" || eventType === "open_meeting" ? "Topic" : "Title"}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type?.title} autoFocus={!event} />
          </label>
          <label className="fld half">
            <span>Day</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </label>
          <label className="fld half">
            <span>Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {hasMeetup && (
            <label className="fld half">
              <span>Meet at</span>
              <input type="time" value={meetup} onChange={(e) => setMeetup(e.target.value)} />
            </label>
          )}
          {/* Full width: a new spot can be saved from here, and needs the room. */}
          <label className="fld">
            <span>Where</span>
            <LocationInput
              value={location}
              onChange={setLocation}
              placeholder="Pick a spot or type one"
              kind={eventType === "paper_sale" ? "paper_sale" : eventType === "uni_stall" ? "uni_stall" : eventType === "social" ? "social" : "meeting"}
            />
          </label>
          <label className="fld">
            <span>Lead</span>
            <PersonPicker mode="id" value={leadId} onChange={setLeadId} />
          </label>
          {isMeeting && (
            <>
              <label className="fld half">
                <span>Chair</span>
                <PersonPicker mode="id" value={chairId} onChange={setChairId} placeholder="Blank: ask on Tasks" />
              </label>
              <label className="fld half">
                <span>Minutes</span>
                <PersonPicker mode="id" value={minutesId} onChange={setMinutesId} placeholder="Blank: ask on Tasks" />
              </label>
            </>
          )}
          {eventType === "paper_sale" && (
            <>
              <label className="fld half">
                <span>Issue</span>
                <input value={paperIssue} onChange={(e) => setPaperIssue(e.target.value)} placeholder="e.g. #56" />
              </label>
              <label className="fld half">
                <span>Copies taken</span>
                <input type="number" min="0" inputMode="numeric" value={copiesOut} onChange={(e) => setCopiesOut(e.target.value)} placeholder="e.g. 30" />
              </label>
            </>
          )}
        </div>

        <button type="button" className="link small" style={{ alignSelf: "flex-start" }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? "Fewer options" : "More: people needed, who it's for, description"}
        </button>
        {more && (
          <div className="fgrid">
            <label className="fld half">
              <span>People needed</span>
              <input type="number" min="0" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Optional" />
            </label>
            {target && parseInt(target) > 0 ? (
              <label className="fld half">
                <span>Decide by</span>
                <input type="datetime-local" value={confirmBy} onChange={(e) => setConfirmBy(e.target.value)} />
              </label>
            ) : (
              <p className="fld half small" style={{ margin: 0, alignSelf: "end" }}>
                With a number and a deadline, it only goes ahead if enough say going.
              </p>
            )}
            {!isMeeting && (
              <label className="fld">
                <span>Who&apos;s it for</span>
                <select className="inp" value={scope} onChange={(e) => setScope(e.target.value as EventScope)}>
                  {(Object.keys(EVENT_SCOPE_LABEL) as EventScope[]).map((k) => (
                    <option key={k} value={k}>
                      {EVENT_SCOPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="fld">
              <span>Description</span>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What, why, what to read or bring" />
            </label>
            {eventType !== "mobilization" && (
              <label className="row gap8 small" style={{ gridColumn: "span 2" }}>
                <input type="checkbox" checked={isMobilization} onChange={(e) => setIsMobilization(e.target.checked)} />
                Pin it as a mobilisation (shows first everywhere)
              </label>
            )}
          </div>
        )}

        {error && <p className="small red">{error}</p>}
        <button type="submit" className="btn btn-p" disabled={saving}>
          {saving && <Spinner className="h-4 w-4" />}
          {event ? "Save" : "Add event"}
        </button>
      </form>
    </Modal>
  );
}

/** ISO → local day and time for the date/time inputs. */
function splitLocal(iso: string) {
  const [day, time] = toLocalInput(iso).split("T");
  return { day, time };
}

/** ISO string → value a `datetime-local` input can display, in local time. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
