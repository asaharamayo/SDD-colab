import type {
  InitiativeMeta,
  StageId,
  StageView,
  StepId,
  StepStatus,
  StepView,
} from "./types";

/**
 * Spec Kit workflow, expressed as clickable steps. Each step maps 1:1 to a
 * `/speckit.<id>` command so the surface and the IDE stay interchangeable.
 */
export interface StepDef {
  id: StepId;
  label: string;
  command: string;
  blurb: string;
  output?: string;
  scope: "feature" | "repo" | "handoff";
  inputHint?: string;
  instructions: string;
}

export const CONSTITUTION_PATH = ".specify/memory/constitution.md";

export const STEPS: StepDef[] = [
  {
    id: "constitution",
    label: "Principles",
    command: "/speckit.constitution",
    blurb: "Project-wide rules every spec and plan must respect.",
    output: CONSTITUTION_PATH,
    scope: "repo",
    inputHint: "What principles matter? e.g. privacy first, test before build",
    instructions: `Create or update the project constitution at ${CONSTITUTION_PATH}.
- Capture 3–7 concrete, testable principles (name, rule, rationale).
- Add a Governance section and a version line (semver, ratified/last-amended dates).
- Keep it short. Do not touch any other file.`,
  },
  {
    id: "brief",
    label: "Brief",
    command: "/brief",
    blurb: "Problem, intended user value, hypothesis, scope and dependencies — settle these first.",
    output: "brief.md",
    scope: "feature",
    inputHint: "Add context, or ask the agent to challenge the brief",
    instructions: `Review brief.md in the feature directory as a critical product peer.
- If the message supplies new information (answers, scope calls, data), update brief.md: keep its section headings (Problem, Intended user value, Hypothesis, Scope, Dependencies, Open questions); tick an open question "- [x]" only when it is actually resolved.
- Otherwise do not edit anything. Reply with: what is clear; what is missing or vague (per section); contradictions; whether the outcome and scope are settled; up to 5 open questions with suggested options; and a one-line verdict — "Clear enough to specify" or "Resolve first: …".
- A good hypothesis is falsifiable and names a metric. Scope must say what is out as well as in.`,
  },
  {
    id: "specify",
    label: "Specify",
    command: "/speckit.specify",
    blurb: "Turn the agreed scope into behaviours, rules, stories and acceptance criteria.",
    output: "spec.md",
    scope: "feature",
    inputHint: "Anything the spec must cover beyond the brief?",
    instructions: `Write or update spec.md in the feature directory from brief.md (the brief is the agreed scope — do not widen it), following the Spec Kit spec template:
- Title line: "# Feature Specification: <name>", then Feature Branch, Created, Status: Draft, Input (link to brief.md).
- "## User Scenarios & Testing" with prioritised user stories (P1, P2, P3), each independently testable, with Given/When/Then acceptance scenarios, plus "### Edge Cases".
- "## Requirements": numbered functional requirements (FR-001…) describing behaviours, "### Business Rules" (BR-001…), and Key Entities if data is involved.
- "## Success Criteria" with measurable outcomes (SC-001…), technology-agnostic, traceable to the brief's hypothesis.
- "## Out of Scope" copied from and consistent with the brief.
- Focus on WHAT and WHY. No implementation details, frameworks or APIs.
- Mark genuine unknowns inline as [NEEDS CLARIFICATION: specific question] — at most 3; make informed assumptions for the rest and list them under "## Assumptions".
- Tag every assumption with who should actually weigh in on it: prefix each bullet with **[Product]**, **[Engineering]** or **[Quality]** (problem/customer/success calls → Product; feasibility/architecture/data calls → Engineering; testability/edge-case/risk calls → Quality). Pick the one role that owns the call, not the one merely affected by it.`,
  },
  {
    id: "clarify",
    label: "Clarify",
    command: "/speckit.clarify",
    blurb: "Find ambiguity, assumptions, contradictions and missing requirements — as a team.",
    output: "spec.md",
    scope: "feature",
    inputHint: "Answer a question, or say 'ask me'",
    instructions: `Run a clarification pass on spec.md. The user's message may bundle several resolutions at once, one per line — handle each independently:
- "Q: <question> → A: <answer>" — apply it: add a bullet "- Q: … → A: …" under "## Clarifications" / "### Session <today's date>", then update the affected requirement or story and remove the matching [NEEDS CLARIFICATION] marker.
- "Confirmed: <assumption text>" — find that bullet under "## Assumptions" and append " — confirmed by @<their name>." to it. Do not reword it.
- "Correction to assumption: <original> → <their correction>" — replace that bullet's text with the correction, keep its **[Role]** tag, and append " — corrected by @<their name>." Also check whether the correction changes any requirement or story that relied on the old assumption, and update those too.
- If the message has none of these (plain prose instead), treat it as a free-text answer to the most recent open questions — same handling as "Q: … → A: …" above.
- Otherwise (nothing to apply), scan the spec for ambiguity (scope, data, UX flow, non-functional, edge cases) and ask up to 5 high-impact questions in your reply. Do not edit the spec until answers arrive.
- Tag every question you ask with exactly one owner, as a bullet prefix: **[Product]** for problem/customer/success calls, **[Engineering]** for feasibility/architecture/data calls, **[Quality]** for testability/edge-case/risk calls. One tag per question, the role that should actually decide it.
- When a question has 2–4 sensible options, list them as indented sub-bullets directly under it — one per line, formatted exactly "  - A) <option text>", mark your recommended one by appending " (recommended)". Put the question itself on the tagged bullet line and nothing else there; options only ever go in the sub-bullets below it, never inline. This is what turns them into clickable answers in the UI — freeform questions (no sub-bullets) still work, they just get a text box instead.`,
  },
  {
    id: "plan",
    label: "Plan",
    command: "/speckit.plan",
    blurb: "Decide how to build it — architecture, data, contracts.",
    output: "plan.md",
    scope: "feature",
    inputHint: "Any tech constraints? e.g. use the existing GraphQL gateway",
    instructions: `Create plan.md in the feature directory from spec.md (and the constitution if present):
- Summary, Technical Context (language, dependencies, storage, testing, target platform, performance goals, constraints, scale), Constitution Check (pass/fail per principle with justification), Project Structure, Complexity Tracking.
- Also write research.md (decisions, rationale, alternatives considered), data-model.md (entities, fields, relationships, validation, state transitions) and quickstart.md (how to verify end-to-end). Add contracts/ only if the feature exposes interfaces.
- Unknowns in Technical Context become NEEDS CLARIFICATION items that research.md resolves.`,
  },
  {
    id: "tasks",
    label: "Tasks",
    command: "/speckit.tasks",
    blurb: "Break the plan into small, ordered, checkable tasks.",
    output: "tasks.md",
    scope: "feature",
    instructions: `Create tasks.md in the feature directory from plan.md and spec.md:
- Phases: Setup, Foundational, one phase per user story in priority order (each independently testable), then Polish.
- Strict format: "- [ ] T001 [P] [US1] Description with exact file path". [P] only when parallelisable (different files, no dependency). [USn] only inside user-story phases.
- End with Dependencies & Execution Order and an MVP note (user story 1 first).`,
  },
  {
    id: "analyze",
    label: "Analyze",
    command: "/speckit.analyze",
    blurb: "Read-only consistency check across spec, plan and tasks — written to analyze.md.",
    output: "analyze.md",
    scope: "feature",
    instructions: `Read spec.md, plan.md, tasks.md and the constitution (if present). This is READ-ONLY with respect to all of those — do not modify any of them.
Write (or overwrite) analyze.md with a findings table — columns ID, Category, Severity (CRITICAL/HIGH/MEDIUM/LOW), Location, Summary, Recommendation — covering duplication, ambiguity, underspecification, constitution conflicts, coverage gaps (requirements with no task, tasks with no requirement) and inconsistency. Follow the table with coverage metrics and suggested next actions.
Always overwrite the whole file from scratch — this is a fresh check against the current spec/plan/tasks each run, not a running log to append to.`,
  },
  {
    id: "implement",
    label: "Implement",
    command: "/speckit.implement",
    blurb: "Build it in the product repo — hand off to an engineer's IDE.",
    scope: "handoff",
    instructions: "",
  },
];

export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<
  StepId,
  StepDef
>;

/** `/speckit.plan use postgres` → { step: "plan", args: "use postgres" }. */
export function parseCommand(text: string): { step?: StepId; args: string } {
  const m = text.trim().match(/^\/(?:speckit\.)?([a-z]+)\b\s*([\s\S]*)$/i);
  if (m) {
    const id = m[1].toLowerCase() as StepId;
    if (id in STEP_BY_ID) return { step: id, args: m[2].trim() };
  }
  return { args: text.trim() };
}

const CLARIFY_MARKER = /\[NEEDS CLARIFICATION[^\]]*\]/g;

/** Code spans and fences quote the marker (e.g. analyze.md's "Open `[NEEDS CLARIFICATION]`: 0") — never an open question. */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

export function countClarifications(markdown: string | undefined): number {
  return markdown ? (stripCode(markdown).match(CLARIFY_MARKER) ?? []).length : 0;
}

/** Severity counts from analyze.md's findings table (rows like `| F001 | Category | HIGH | …`). */
export function analyzeFindings(md: string | undefined) {
  const out = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  if (!md) return out;
  for (const line of md.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5 || !/^[A-Z]{1,3}\d+$/.test(cells[1])) continue;
    const sev = cells[3].replace(/\*/g, "").toLowerCase();
    if (sev !== "critical" && sev !== "high" && sev !== "medium" && sev !== "low") continue;
    out[sev] += 1;
    out.total += 1;
  }
  return out;
}

export function countTasks(markdown: string | undefined): { done: number; total: number } {
  if (!markdown) return { done: 0, total: 0 };
  const all = markdown.match(/^\s*[-*] \[[ xX]\]/gm) ?? [];
  const done = all.filter((l) => /\[[xX]\]/.test(l)).length;
  return { done, total: all.length };
}

export interface FeatureSnapshot {
  files: string[];
  brief?: string;
  spec?: string;
  tasks?: string;
  analyze?: string;
  hasConstitution: boolean;
  /** Someone confirmed the tasks after the latest tasks.md / analyze.md commit. */
  tasksReviewed?: boolean;
}

/* ---------- Brief (stage 1) ---------- */

export const BRIEF_SECTIONS = [
  { key: "problem", heading: "Problem", hint: "Who is struggling with what, and how do we know?" },
  { key: "value", heading: "Intended user value", hint: "What gets better for them if we solve it?" },
  { key: "hypothesis", heading: "Hypothesis", hint: "We believe … will … measured by …" },
  { key: "scope", heading: "Scope", hint: "What's in — and explicitly what's out" },
  { key: "dependencies", heading: "Dependencies", hint: "Teams, systems, data or decisions we rely on" },
] as const;

export function sectionBody(md: string, heading: string): string | null {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(l.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function hasContent(body: string | null): boolean {
  if (!body) return false;
  const meaningful = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[-*]?\s*(\[[ xX]\]\s*)?<[^>]*>\.?$/.test(l) && !/^\*\*[^*]+\*\*:?$/.test(l) && !/^[-*]\s*$/.test(l));
  return meaningful.join(" ").length >= 3;
}

export function briefChecks(md: string | undefined) {
  const sections = BRIEF_SECTIONS.map((s) => ({ ...s, filled: hasContent(md ? sectionBody(md, s.heading) : null) }));
  const openBody = md ? (sectionBody(md, "Open questions") ?? "") : "";
  const openQuestions =
    (openBody.match(/^\s*[-*] \[ \]\s*(?!<).+$/gm) ?? []).length + countClarifications(md);
  const ready = Boolean(md) && sections.every((s) => s.filled) && openQuestions === 0;
  return { sections, openQuestions, ready };
}

const ROLE_TAG = /^\*\*\[(Product|Engineering|Quality)\]\*\*\s*/;

/** Who owns each role-tagged question or assumption, parsed from the agent's `**[Role]**` prefix. */
export function parseRoleTag(line: string): { role: LensId | null; text: string } {
  const m = line.match(ROLE_TAG);
  if (!m) return { role: null, text: line };
  return { role: m[1].toLowerCase() as LensId, text: line.slice(m[0].length).trim() };
}

/**
 * Two different things Specify leaves behind, easy to conflate:
 * - open: questions it chose to ASK you (`[NEEDS CLARIFICATION]`) — resolve with Clarify.
 * - assumptions: decisions it made FOR you without asking (`## Assumptions`) — yours to review, not to clarify.
 */
/** Suffix the agent appends to an assumption bullet once someone's resolved it. */
const RESOLUTION_TAG = /\s+—\s+(?:confirmed|corrected)\s+by\s+@[^.]+\.?\s*$/i;

export function specChecks(md: string | undefined) {
  const open = countClarifications(md);
  const body = md ? sectionBody(md, "Assumptions") : null;
  const assumptions = body
    ? (body.match(/^\s*[-*]\s+.+$/gm) ?? [])
        .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
        .filter((l) => l.length > 0 && !/^<.*>$/.test(l))
        .map(parseRoleTag)
        .map(({ role, text }) => ({ role, resolved: RESOLUTION_TAG.test(text), text: text.replace(RESOLUTION_TAG, "") }))
    : [];
  return { open, assumptions };
}

export interface TaggedQuestion {
  text: string;
  /** Lettered options the agent offered, in order — empty means it asked freeform. */
  options: string[];
}

/** Role-tagged questions (with any lettered options) in a Clarify reply's chat text. */
export function parseTaggedQuestions(replyText: string): Partial<Record<LensId, TaggedQuestion[]>> {
  const out: Partial<Record<LensId, TaggedQuestion[]>> = {};
  let current: TaggedQuestion | null = null;
  for (const raw of replyText.split("\n")) {
    const top = raw.match(/^\s{0,1}[-*]\s+(.+)$/);
    const sub = !top ? raw.match(/^\s{2,}[-*]\s+(.+)$/) : null;
    if (top) {
      const { role, text } = parseRoleTag(top[1]);
      current = role && text ? { text, options: [] } : null;
      if (current) (out[role!] ??= []).push(current);
    } else if (sub && current) {
      const opt = sub[1].match(/^[A-D][).]\s*(.+)$/i);
      if (opt) current.options.push(opt[1].trim());
    }
  }
  return out;
}

interface MinimalMessage {
  id: string;
  role: string;
  status?: string;
  text: string;
}

/** Most recent agent reply that asked role-tagged questions — the live queue waiting on answers. */
export function latestTaggedQuestions(
  messages: MinimalMessage[],
): { id: string; tagged: Partial<Record<LensId, TaggedQuestion[]>> } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "agent" || m.status !== "done" || !m.text) continue;
    const tagged = parseTaggedQuestions(m.text);
    if (Object.keys(tagged).length > 0) return { id: m.id, tagged };
  }
  return null;
}

/** How many open items (your role's questions + assumptions) are waiting on you specifically. */
export function pendingCount(spec: string | undefined, messages: MinimalMessage[], role: LensId | null): number {
  if (!role) return 0;
  const { assumptions } = specChecks(spec);
  const mineAssumptions = assumptions.filter((a) => (a.role === role || a.role === null) && !a.resolved).length;
  const latest = latestTaggedQuestions(messages);
  if (latest) return mineAssumptions + (latest.tagged[role]?.length ?? 0);
  // Clarify hasn't run yet this round, so nothing's triaged by role — surface the
  // raw marker count instead of hiding the fact that something needs attention.
  return mineAssumptions + countClarifications(spec);
}

export function briefTemplate(input: {
  title: string;
  problem?: string;
  value?: string;
  hypothesis?: string;
  inScope?: string;
  outScope?: string;
  dependencies?: string;
}): string {
  const bullets = (s: string | undefined, placeholder: string) => {
    const items = (s ?? "").split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
    return (items.length ? items : [placeholder]).map((l) => `- ${l}`).join("\n");
  };
  return `# Brief: ${input.title}

## Problem

${input.problem?.trim() || "<Who is struggling with what, and what evidence do we have?>"}

## Intended user value

${input.value?.trim() || "<What gets better for them if we solve it?>"}

## Hypothesis

${input.hypothesis?.trim() || "<We believe [change] will [outcome] for [users], measured by [metric].>"}

## Scope

**In scope**

${bullets(input.inScope, "<in scope>")}

**Out of scope**

${bullets(input.outScope, "<out of scope>")}

## Dependencies

${bullets(input.dependencies, "<teams, systems, data or decisions we rely on>")}

## Open questions

- [ ] <question that must be settled before we write the spec>
`;
}

function statusFor(step: StepDef, s: FeatureSnapshot): { status: StepStatus; detail?: string } {
  const has = (p: string) => s.files.includes(p);
  switch (step.id) {
    case "constitution":
      return s.hasConstitution ? { status: "done" } : { status: "todo", detail: "Optional" };
    case "brief": {
      if (!s.brief) return { status: "todo" };
      const b = briefChecks(s.brief);
      if (b.ready) return { status: "done" };
      const missing = b.sections.filter((x) => !x.filled).length;
      return {
        status: "attention",
        detail: missing ? `${missing} section${missing > 1 ? "s" : ""} to fill` : `${b.openQuestions} open question${b.openQuestions > 1 ? "s" : ""}`,
      };
    }
    case "specify": {
      if (!s.spec) return { status: "todo" };
      const open = countClarifications(s.spec);
      return open
        ? { status: "attention", detail: `${open} open question${open > 1 ? "s" : ""}` }
        : { status: "done" };
    }
    case "clarify": {
      if (!s.spec) return { status: "todo" };
      const open = countClarifications(s.spec);
      if (open) return { status: "attention", detail: `${open} to resolve` };
      return /^##\s+Clarifications/m.test(s.spec)
        ? { status: "done" }
        : { status: "done", detail: "No open markers" };
    }
    case "plan":
      return has("plan.md") ? { status: "done" } : { status: "todo" };
    case "tasks": {
      if (!s.tasks) return { status: "todo" };
      const t = countTasks(s.tasks);
      const f = has("analyze.md") && !s.tasksReviewed ? analyzeFindings(s.analyze) : null;
      if (f && f.total) return { status: "attention", detail: `Analyze found ${f.total} gap${f.total > 1 ? "s" : ""}` };
      return { status: "done", detail: t.total ? `${t.done}/${t.total} done` : undefined };
    }
    case "analyze": {
      if (!has("analyze.md")) return { status: "info", detail: "Runs after Tasks" };
      if (s.tasksReviewed) return { status: "done", detail: "Reviewed" };
      const f = analyzeFindings(s.analyze);
      return { status: "attention", detail: f.total ? `${f.total} finding${f.total > 1 ? "s" : ""} to review` : "Awaiting review" };
    }
    case "implement":
      return { status: "info", detail: "In the IDE" };
  }
}

export function stepViews(s: FeatureSnapshot): StepView[] {
  let nextAssigned = false;
  return STEPS.map((def) => {
    const { status, detail } = statusFor(def, s);
    const actionable = def.scope === "feature" && def.id !== "analyze";
    const isNext = !nextAssigned && actionable && (status === "todo" || status === "attention");
    if (isNext) nextAssigned = true;
    return {
      id: def.id,
      label: def.label,
      command: def.command,
      blurb: def.blurb,
      output: def.output,
      scope: def.scope,
      inputHint: def.inputHint,
      status,
      detail,
      isNext,
    };
  });
}

/* ---------- Stages: the visible flow ---------- */

export const STAGE_DEFS: { id: StageId; label: string; summary: string; steps: StepId[] }[] = [
  { id: "brief", label: "Brief", summary: "Problem, value, hypothesis, scope", steps: ["brief"] },
  { id: "spec", label: "Spec", summary: "Behaviours, rules, stories, acceptance", steps: ["specify"] },
  { id: "clarify", label: "Clarify", summary: "Ambiguity, assumptions, gaps", steps: ["clarify"] },
  { id: "plan", label: "Plan & tasks", summary: "Approach, tests, sequenced tasks", steps: ["plan", "tasks", "analyze"] },
  { id: "build", label: "Build & validate", summary: "Build, test, validate against spec", steps: ["implement"] },
];

export function stageViews(s: FeatureSnapshot, steps: StepView[]): StageView[] {
  const t = countTasks(s.tasks);
  const gates: Record<StageId, { met: boolean; detail?: string }> = {
    brief: { met: briefChecks(s.brief).ready },
    spec: { met: Boolean(s.spec) },
    clarify: { met: Boolean(s.spec) && countClarifications(s.spec) === 0 },
    plan: {
      met: Boolean(s.tasks) && s.files.includes("plan.md") && Boolean(s.tasksReviewed),
      detail: s.tasks && s.files.includes("plan.md") && !s.tasksReviewed ? "Tasks awaiting review" : undefined,
    },
    build: { met: t.total > 0 && t.done === t.total, detail: t.total ? `${t.done}/${t.total} tasks` : undefined },
  };
  const currentIdx = STAGE_DEFS.findIndex((d) => !gates[d.id].met);
  return STAGE_DEFS.map((d, i) => ({
    id: d.id,
    n: i + 1,
    label: d.label,
    summary: d.summary,
    state: currentIdx < 0 || i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming",
    detail: gates[d.id].detail,
    steps: steps.filter((st) => d.steps.includes(st.id)),
  }));
}

export function currentStage(stages: StageView[]): StageView | undefined {
  return stages.find((st) => st.state === "current");
}

export function featureDescription(meta: Pick<InitiativeMeta, "title" | "problem" | "value">) {
  return [meta.title, meta.problem && `Problem: ${meta.problem}`, meta.value && `Value: ${meta.value}`]
    .filter(Boolean)
    .join("\n");
}

/** Starter spec when no agent is configured — the Spec Kit spec-template skeleton. */
export function fallbackSpec(meta: InitiativeMeta): string {
  return `# Feature Specification: ${meta.title}

**Feature Branch**: \`${meta.slug}\`
**Created**: ${meta.createdAt.slice(0, 10)}
**Status**: Draft
**Input**: ${meta.problem || meta.title}

## User Scenarios & Testing

### User Story 1 - <title> (Priority: P1)

<Describe this journey in plain language.>

**Why this priority**: ${meta.value || "<value>"}

**Independent Test**: <How this story can be tested on its own.>

**Acceptance Scenarios**:

1. **Given** <initial state>, **When** <action>, **Then** <expected outcome>

### Edge Cases

- [NEEDS CLARIFICATION: What happens at the boundaries?]

## Requirements

### Functional Requirements

- **FR-001**: System MUST <capability>

## Success Criteria

### Measurable Outcomes

- **SC-001**: <measurable, technology-agnostic outcome>

## Assumptions

- <assumption>
`;
}

export function fallbackConstitution(): string {
  return `# Project Constitution

## Core Principles

### I. <Principle name>
<Rule, stated so it can be checked.>
**Rationale**: <why>

### II. <Principle name>
<Rule>
**Rationale**: <why>

## Governance

Amendments are proposed as a change to this file and approved in review.

**Version**: 0.1.0 | **Ratified**: ${new Date().toISOString().slice(0, 10)}
`;
}

/** BMAD-style role perspectives, invoked selectively — the guide's Three Amigos. */
export const LENSES = {
  product: {
    label: "Product",
    focus: "problem framing, the customer and job-to-be-done, the what/why, and how success will be measured",
  },
  engineering: {
    label: "Engineering",
    focus: "feasibility, architecture, dependencies on other systems and teams, data availability and non-functional requirements",
  },
  quality: {
    label: "Quality",
    focus: "what could go wrong, edge cases, ambiguity that would make acceptance untestable, and how we'll know it works",
  },
} as const;
export type LensId = keyof typeof LENSES;

export function buildAgentPrompt(input: {
  lens?: LensId;
  meta: InitiativeMeta;
  featureDir: string;
  files: string[];
  step?: StepId;
  message: string;
  author: string;
  repoCommand?: string;
  primed: boolean;
}): string {
  const { meta, featureDir, step, message, author } = input;
  const def = step ? STEP_BY_ID[step] : undefined;
  const parts: string[] = [];

  if (!input.primed) {
    parts.push(
      `You are the spec assistant inside a shared Spec Kit workspace. Several people collaborate on this feature; ${author} sent this message.`,
      "",
      "## Ground rules",
      `- Work only inside \`${featureDir}/\` (and \`${CONSTITUTION_PATH}\` when asked about principles). Never touch other paths.`,
      "- Do not run git, create branches, run scripts, or install anything. The workspace commits after a human reviews your edits.",
      "- Separate facts from assumptions. Never invent metrics, people, systems or decisions; mark unknowns as [NEEDS CLARIFICATION: question].",
      "- Humans own intent and decisions: propose, don't decide.",
      "- Finish with a short reply: what you changed (file by file) and what needs a human answer.",
      "",
      "## Feature",
      `- Directory: \`${featureDir}/\``,
      `- Title: ${meta.title}`,
      meta.problem ? `- Problem: ${meta.problem}` : "",
      meta.value ? `- Intended value: ${meta.value}` : "",
      `- Existing files: ${input.files.length ? input.files.join(", ") : "none yet"}`,
    );
  } else {
    parts.push(
      `(${author}) Reminder: stay inside \`${featureDir}/\`, no git or scripts, end with a short summary.`,
    );
  }

  if (def && def.instructions) {
    parts.push("", `## Step: ${def.command}`, def.instructions);
    if (input.repoCommand) {
      parts.push(
        "",
        "The repository also defines this command. Follow its intent where it doesn't conflict with the ground rules (skip any scripts, branch creation or git steps — the workspace already created the feature directory):",
        "<repo-command>",
        input.repoCommand.slice(0, 8000),
        "</repo-command>",
      );
    }
  }

  if (input.lens) {
    const l = LENSES[input.lens];
    parts.push(
      "",
      `## Perspective: ${l.label}`,
      `Review strictly through the ${l.label} lens — ${l.focus}. Label your findings "${l.label} view" and skip points another role owns.`,
    );
  }

  parts.push("", "## Message", message || (def ? `Run ${def.command} for this feature.` : ""));
  return parts.filter((p) => p !== undefined).join("\n");
}
