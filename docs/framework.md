# Unified Spec Workspace — framework (locked 2026-10-28)

A user-friendly wrapper on the SDD skeleton. Spec Kit underneath; clicks, live co-editing and shared review on top — so a distributed team can run a working session without one engineer typing while everyone else reads aloud.

The flow is the usual spec-driven sequence: settle the outcome, specify behaviour, clarify as a team, plan the work, then build against the spec.

## The five stages

Every feature sits in exactly one stage. The stage is always visible (left rail).

| # | Stage | What happens | Spec Kit underneath | Artefact | Gate to move on |
|---|---|---|---|---|---|
| 1 | **Brief** | Problem, intended user value, hypothesis, scope (in/out), dependencies. If outcome or scope is unsettled, resolve that first. | — (readiness check before specifying) | `brief.md` | Outcome and scope settled; no open questions |
| 2 | **Spec** | Turn agreed scope into behaviours, business rules, user stories, acceptance criteria, edge cases, out of scope. | `/speckit.specify` | `spec.md` | Spec drafted from the brief |
| 3 | **Clarify** | As a team: ambiguity, assumptions, contradictions, dependencies, missing requirements. If it changes scope/behaviour, update the spec. | `/speckit.clarify` | `spec.md` (Clarifications) | No open `[NEEDS CLARIFICATION]` |
| 4 | **Plan & tasks** | Engineering shapes approach, constraints, tests; team breaks it into sequenced, traceable tasks; consistency check and review. | `/speckit.plan`, `/speckit.tasks`, `/speckit.analyze` | `plan.md`, `tasks.md` (+ research, data-model, contracts) | Tasks exist; analyze run and reviewed |
| 5 | **Build & validate** | Build, test and validate against the spec. Tasks go straight to the team or into Jira — Jira optional, never the source of truth. | `/speckit.implement` | code, ticked `tasks.md` | All tasks done and validated against spec |

`/speckit.constitution` is project-wide setup, not a stage.

## What we take from each framework

| From | The good point | How it shows up |
|---|---|---|
| **Spec Kit** | Structured artefacts and checks | The file layout, templates, `[NEEDS CLARIFICATION]` markers, analyze checks. The only workflow. |
| **OpenSpec** | Change diffs | Every agent edit is a proposal: review the diff, apply or discard, then commit. |
| **BMAD** | Role perspectives, used selectively | Product / Engineering / Quality (Three Amigos) lenses on review and gap analysis — invoked when useful, not a persona pipeline. |
| **Kiro** | Integrated experience, without vendor lock-in | One surface: stages, docs, agent chat, live co-editing. Buttons send the same instruction as the slash command. Plain markdown in git. |
| **AI assist** | Drafting, gap analysis, traceability, drift detection | Agent drafts each artefact; flags gaps per stage; links brief → spec → tasks; flags when spec and tasks drift apart. |

## Decisions

- **No modes.** One flow for every feature (Quick/Standard/Deep removed).
- **Host = an engineer with the codebase.** They clone the repo, run the site, and their Cursor agent writes and commits to GitHub. The agent sees real code, per the guide's "ground the AI in real context".
- **Commit identity is not important yet.** Single committer is fine; a "who changed what" log is a later stage.
- **A single host is enough for a demo.** Remote guests are optional.

## Later

- Change log of who edited what.
- Jira import from `tasks.md`.
- Drift detection between spec, tasks and code.
