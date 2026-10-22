"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { patch } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { Event, EventShare, SocialPost } from "@/lib/types";
import type { GraphicOptions } from "@/components/rcs-graphic";
import { Spinner } from "@/components/ui";
import { GraphicMaker, type GraphicSeed } from "@/components/graphic-maker";
import { festivalDates } from "@/lib/festival";
import { useFestival } from "@/lib/festival-config";
import { firstPart, fmtDay, fmtTime } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";

export default function GraphicPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center"><Spinner /></div>}>
      <GraphicInner />
    </Suspense>
  );
}

/** Quotes are short, punchy lines; anything else on the planner is an event-style post. */
function seedFromPost(p: SocialPost): GraphicSeed {
  const looksLikeQuote = /[.!]$/.test(p.title) && !/tonight|reminder|recap/i.test(p.title);
  if (looksLikeQuote) return { tpl: "quote", fields: { quote: { quote: p.title } } };
  return { tpl: "event", fields: { event: { title: p.title.replace(/ (tonight|reminder)$/i, "") } } };
}

/**
 * The graphic maker as a full screen: from Social ("Make graphic" on a
 * post, or the Graphic button) and from an event page (pre-filled from the
 * event). Attaching to a post moves it to Review.
 */
function GraphicInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const actor = useActor();
  const wantsFestival = params.get("festival") === "1";
  const { festival, loading: festivalLoading } = useFestival();
  const eventId = params.get("event");
  const postId = params.get("post");
  // Opened from an event's share sheet: the result becomes the link's picture.
  const shareId = params.get("share");
  const { data: share, loading: shareLoading } = useData<EventShare | null>(shareId && eventId ? `/api/events/${eventId}/share` : null);
  const { data: posts } = useData<SocialPost[]>(postId ? "/api/social-posts" : null);
  const post = posts?.find((p) => p.id === postId);
  // A post promoting an event is seeded from the event (date, time, place).
  const forEvent = eventId ?? post?.event_id ?? null;
  const { data: events } = useData<Event[]>(forEvent ? "/api/events" : null);
  const event = events?.find((e) => e.id === forEvent);
  const canEditPosts = hasAnyRole(actor, "social_media_officer", "general_secretary");

  if ((forEvent && !events) || (postId && !posts) || (!!shareId && shareLoading) || (wantsFestival && festivalLoading)) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const festivalSeed: GraphicSeed | undefined = festival
    ? {
        tpl: "event",
        fields: {
          event: {
            kicker: "Revolutionary Communist Party",
            title: festival.name,
            sub: "",
            date: festivalDates(festival),
            time: "",
            where: festival.location ?? "",
            cta: "Get your ticket",
            link: (festival.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
          },
        },
        options: festival.url ? { qr: festival.url, qrCaption: "tickets" } : {},
      }
    : undefined;

  const seed: GraphicSeed | undefined = wantsFestival && !event && !post
    ? festivalSeed
    : event
    ? {
        tpl: "event",
        fields: {
          event: {
            title: firstPart(event.title, " — "),
            date: fmtDay(event.start_time),
            time: fmtTime(event.start_time),
            where: firstPart(event.location || ""),
            ...((share?.graphic?.f ?? {}) as Record<string, string>),
          },
        },
        options: { ...((share?.graphic?.o ?? {}) as Partial<GraphicOptions>), ...(shareId ? { size: "banner" as const } : {}) },
      }
    : post
      ? seedFromPost(post)
      : undefined;

  return (
    <div className="screen pg pg-g">
      <div className="ph">
        <button type="button" className="btn-ic" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </button>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Make graphic</h1>
          {(post || event) && <p className="sub trunc">For: {post?.title ?? event?.title}</p>}
        </div>
      </div>
      {shareId && share?.graphic?.custom && (
        <p className="small" style={{ margin: "0 0 8px" }}>
          This link currently shows a picture made elsewhere. Using a design from here will replace it.
        </p>
      )}
      <GraphicMaker
        key={`${wantsFestival ? "festival" : (postId ?? eventId ?? "new")}-${share?.id ?? ""}`}
        seed={seed}
        eventType={event?.event_type ?? null}
        onUse={
          post && canEditPosts && !shareId
            ? async (out) => {
                // The picture goes on the post, so whoever posts it has it.
                await patch(`/api/social-posts/${post.id}`, { image: out.image, status: post.status === "ready" ? "ready" : "needs_review" });
                revalidate("/api/social-posts");
                toast("Attached · post moved to Review");
                router.push("/social-media");
              }
            : shareId
            ? async (out) => {
                await patch(`/api/shares/${shareId}`, { graphic: { tpl: "event", f: out.fields, o: out.options, ...(out.custom ? { custom: true } : {}) }, image: out.image });
                revalidate(`/api/events/${eventId}/share`);
                toast(out.custom ? "The link now shows your picture" : "The link now shows this graphic");
                router.back();
              }
            : undefined
        }
        primaryLabel={shareId ? "Use for the link" : post && canEditPosts ? "Attach to post" : "Share"}
      />
    </div>
  );
}
