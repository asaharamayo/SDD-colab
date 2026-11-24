/**
 * Showcase reads. The in-app agent cannot use the Cursor Atlassian login, so
 * these pages are returned locally when their URL is pasted. Wording is the
 * PRD as given — section headings match the brief so the checklist can score it.
 */

export interface DemoPrd {
  pageId: string;
  title: string;
  markdown: string;
}

const OPEN_DOORS_URL =
  "https://wiki.example.com/wiki/spaces/TEAM/pages/1000000001/Open+Doors+PRD";

const OPEN_DOORS: DemoPrd = {
  pageId: "1000000001",
  title: "Open Doors PRD",
  markdown: `# Brief: Open Doors

Imported from [Open Doors PRD](${OPEN_DOORS_URL}).

Illustrative example only. This is a fictional PRD, not a real initiative. The problem, targets, and assumptions below would need validation.

**Status**: Example draft
**Audience**: Employees across teams, disciplines, and locations
**Owner**: Example Product Manager
**Ambition**: Make internal growth opportunities as visible and discoverable as external ones.

## Problem

What if the same care a company puts into helping customers find a next step could help its own people find theirs?

Inside a large organisation, great opportunities can be easy to miss: a short-term project, a mentor, a chance to shadow another team, or a way to share a skill. Access may depend on who someone happens to know or which conversations they happen to be part of.

This is a hypothesis, not established research. We want to test whether a lightweight, permission-aware opportunity marketplace could help more people discover meaningful ways to learn, contribute, and connect.

## Intended user value

Open Doors is a simple internal discovery experience where employees can share and find short-term opportunities beyond their usual role.

An employee searches for something they want to learn or contribute to, finds a relevant opportunity, checks the time commitment and eligibility, and expresses interest in one click.

Example opportunities:

- Join a two-week cross-functional project.
- Shadow another team for a day.
- Find a mentor or join a mentoring circle.
- Share expertise through a talk, workshop, or community.
- Volunteer for a customer research, innovation, or social-impact activity.

## Hypothesis

We believe a lightweight, permission-aware opportunity marketplace will help more employees discover meaningful ways to learn, contribute, and connect — measured in a pilot by discovery, action after discovery, owner usefulness, and whether access to growth feels more open.

Example pilot targets only. Reset after discovery.

- 40% or more of pilot participants discover at least one relevant opportunity.
- 20% or more of participants take an action after discovery.
- 70% or more of opportunity owners say the tool helped them find interested people.
- 70% or more of participants agree access to growth opportunities feels more open.

Success looks like: employees in a pilot discover opportunities they would not otherwise have found, and opportunity owners can attract interested people with minimal effort.

## Scope

**In scope**

- A searchable feed of opportunities with topic, time commitment, location, and closing date.
- A simple "I can help with…" and "I'd like to learn…" profile.
- One-click expression of interest with a short note.
- An owner view to review interest and close an opportunity.
- Clear visibility and access rules, with no private performance or career data exposed.
- A concierge pilot before a full product: seed 20–30 real opportunities, invite a small representative group, manually support matching, and collect feedback for four weeks. Continue only if employees find opportunities valuable and owners can manage participation fairly.

**Out of scope**

- Replacing formal recruitment, promotion, performance, or career-development processes.
- Automatically recommending people for roles or making talent decisions.
- Exposing private employee, manager, or performance information.
- Promising a project, mentor, or role to every person who expresses interest.
- Building complex AI matching in the first release.

## Dependencies

- Volunteer opportunity owners from a range of teams and disciplines.
- Relevant People/HR, privacy, security, and employee-experience partners.
- A representative pilot group across roles, locations, and levels.
- A lightweight way to authenticate users and respect existing access permissions.

## Open questions

- [ ] Real demand: do employees want short-term opportunities, or do they primarily want formal career moves?
- [ ] Time and manager support: can people participate without creating delivery or workload problems?
- [ ] Opportunity quality: how do we prevent vague, inactive, or "always-on" listings?
- [ ] Fair access: how do we avoid rewarding only people who have spare time, high visibility, or existing networks?
- [ ] Privacy and trust: what information is necessary to make a useful match without creating unintended talent signals?
`,
};

const PAGES = [OPEN_DOORS];

export function demoPrdForUrl(url: string | undefined | null): DemoPrd | null {
  if (!url) return null;
  const id = url.match(/\/pages\/(\d+)/)?.[1];
  if (!id) return null;
  return PAGES.find((p) => p.pageId === id) ?? null;
}
