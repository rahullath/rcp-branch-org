import type { EventType } from "./types";

/**
 * What each kind of event is, for someone who's never been: the public share
 * page shows this under the title. Two sentences on what it is, and three
 * steps for how it runs. Written for a contact, not a member.
 */
export interface InviteBrief {
  /** The kicker above the title. */
  label: string;
  what: string;
  steps: string[];
  /** Heading for the part about this particular one. */
  thisOne: string;
}

const BRIEFS: Partial<Record<EventType, InviteBrief>> = {
  branch: {
    label: "Branch meeting",
    what: "The weekly meeting of the local communists. Each week there's one political topic, a short talk to open it, then a discussion anyone can come into. There's a reading or a talk to listen to beforehand; it makes the discussion much better. You don't have to speak.",
    steps: ["A comrade opens the topic in about 15 minutes", "Discussion: questions, disagreements, experiences", "A summing-up, then a few minutes on what the branch is doing that week"],
    thisOne: "This week",
  },
  open_meeting: {
    label: "Open meeting",
    what: "A public meeting, open to anyone curious about communist ideas. A speaker introduces the topic, then it's opened up to the room.",
    steps: ["A talk to introduce the topic", "Questions and discussion from the floor", "Stay after to talk and find out how to get involved"],
    thisOne: "What it's about",
  },
  reading_group: {
    label: "Reading group",
    what: "A small group reading a Marxist classic together, a section at a time. We go through it in plain words and argue about what it means now. Read the section beforehand; it's what the discussion is built on.",
    steps: ["A quick recap of where we are", "Going through the section together", "What it means today, and what's next time"],
    thisOne: "This session",
  },
  paper_sale: {
    label: "Paper sale",
    what: "We sell The Communist, the party's paper, and talk to people on the street about politics. Come and see what it's like: you'll be with someone who's done it before.",
    steps: ["Meet up and set out the papers", "Talk to people and sell the paper", "Stay as long as you like"],
    thisOne: "Details",
  },
  uni_stall: {
    label: "Campus stall",
    what: "A stall on campus with papers, books and a sign-up sheet, talking to students about communism. Come and help out, or just come and talk.",
    steps: ["Set up the stall", "Talk to people walking past", "Pack up together"],
    thisOne: "Details",
  },
  social: {
    label: "Social",
    what: "A relaxed evening with the branch. No agenda, just a chance to meet everyone.",
    steps: [],
    thisOne: "Details",
  },
  mobilization: {
    label: "Going together",
    what: "We're going as a group. Message whoever sent you this link to sort out where to meet and travel.",
    steps: [],
    thisOne: "Details",
  },
  postering: {
    label: "Postering",
    what: "Putting up posters for upcoming meetings around the area, in pairs. A good way to meet people in the branch.",
    steps: [],
    thisOne: "Details",
  },
};

const FALLBACK: InviteBrief = { label: "Event", what: "", steps: [], thisOne: "Details" };

export const inviteBrief = (type: EventType): InviteBrief => BRIEFS[type] ?? FALLBACK;
