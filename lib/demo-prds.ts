/**
 * Showcase reads. The in-app agent cannot use a live wiki login, so
 * these pages are returned locally when their URL is pasted. Wording is a
 * fictional PRD — section headings match the brief so the checklist can score it.
 */

export interface DemoPrd {
  pageId: string;
  title: string;
  markdown: string;
}

const BENCH_URL =
  "https://wiki.example.com/wiki/spaces/TEAM/pages/2000000002/Bench+PRD";

const BENCH: DemoPrd = {
  pageId: "2000000002",
  title: "Bench PRD",
  markdown: `# Brief: Bench

Imported from [Bench PRD](${BENCH_URL}).

Illustrative example only. This is a fictional PRD, not a real initiative. The problem, targets, and assumptions below would need validation.

**Status**: Example draft
**Audience**: Members of a community makerspace
**Owner**: Example Product Manager
**Ambition**: Make workshop seats as easy to claim as buying a coffee.

## Problem

What if booking a shared workshop were as clear as checking a store shelf?

In a busy makerspace, good sessions fill quietly: a weekend ceramics class, a laser-cutter induction, a one-hour mentor slot. People miss them because the sign-up lives in a chat thread, a paper sheet, or whoever happens to be at the front desk.

This is a hypothesis, not established research. We want to test whether a lightweight waitlist could help more members find a seat without staff chasing messages.

## Intended user value

Bench is a simple waitlist for makerspace workshops where members can see open seats, join a queue, and get a clear confirmation when a spot frees up.

A member opens today’s workshops, picks one with seats left (or joins the waitlist), checks the duration and skill level, and claims or queues in one tap.

Example sessions:

- Beginner ceramics — Saturday morning.
- Laser cutter induction — weeknight.
- Mentor office hours — 30 minutes.
- Open studio with tool checkout.
- Guest talk on finishing techniques.

## Hypothesis

We believe a lightweight waitlist will help more members claim seats they would otherwise miss — measured in a pilot by discovery, successful claims after waitlisting, host usefulness, and whether booking feels fairer.

Example pilot targets only. Reset after discovery.

- 40% or more of pilot participants discover at least one relevant session.
- 20% or more of participants claim a seat after joining a waitlist.
- 70% or more of session hosts say the tool reduced no-shows or chat chasing.
- 70% or more of participants agree booking feels clearer and fairer.

Success looks like: members in a pilot find sessions they would not otherwise have caught, and hosts fill seats with less manual coordination.

## Scope

**In scope**

- A searchable list of sessions with topic, duration, skill level, and start time.
- One-tap claim when seats remain; waitlist when full.
- Host view to confirm attendance and close a session.
- Clear capacity rules; no payment or membership billing in the pilot.
- A concierge pilot before a full product: seed 15–20 real sessions, invite a small member group, manually support edge cases, and collect feedback for four weeks. Continue only if members claim seats and hosts can run the room fairly.

**Out of scope**

- Replacing the membership system, payments, or access control hardware.
- Automatically recommending sessions from private skill assessments.
- Exposing other members’ attendance history publicly.
- Guaranteeing a seat to everyone on a waitlist.
- Building complex recommendation models in the first release.

## Dependencies

- Volunteer hosts willing to list real sessions.
- Front-desk or community leads for the pilot cohort.
- A representative pilot group across skill levels and schedules.
- A lightweight way to sign members in without new credentials if possible.

## Open questions

- [ ] Real demand: do members want a waitlist, or do walk-ups already work well enough?
- [ ] Host load: can hosts manage confirms without creating new busywork?
- [ ] Session quality: how do we prevent vague or perpetually open listings?
- [ ] Fair access: how do we avoid rewarding only people who refresh the app all day?
- [ ] Privacy: what attendance detail is necessary without creating awkward social signals?
`,
};

const PAGES = [BENCH];

export function demoPrdForUrl(url: string | undefined | null): DemoPrd | null {
  if (!url) return null;
  const id = url.match(/\/pages\/(\d+)/)?.[1];
  if (!id) return null;
  return PAGES.find((p) => p.pageId === id) ?? null;
}
