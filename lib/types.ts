export type StepId =
  | "constitution"
  | "brief"
  | "specify"
  | "clarify"
  | "plan"
  | "tasks"
  | "analyze"
  | "implement";

export type StepStatus = "done" | "attention" | "todo" | "info";

export type DocScope = "feature" | "repo";

export interface DocRef {
  scope: DocScope;
  /** Relative to the feature directory (feature scope) or the repo root (repo scope). */
  path: string;
}

export interface InitiativeMeta {
  /** Spec Kit feature directory name, e.g. `001-apr-tip-cards`. */
  slug: string;
  number: string;
  title: string;
  problem: string;
  value: string;
  owner: string;
  createdAt: string;
  /** Confluence page this brief/PRD is mirrored to, if linked. */
  confluenceUrl?: string;
  /** Figma frames linked on the brief. Multiple allowed; `uploadedAt` marks ones already read into the Design section. */
  figmaFrames?: FigmaFrame[];
  /** Last explicit "tasks reviewed" sign-off. Only counts if newer than tasks.md / analyze.md. */
  tasksReviewed?: { login: string; name: string; at: string };
  /** Task ID (T001…) → Jira issue key, for tickets already created from tasks.md. */
  jiraKeys?: Record<string, string>;
}

export interface FigmaFrame {
  url: string;
  name: string;
  /** ISO timestamp once the agent has written this frame into the brief. Absent = linked only. */
  uploadedAt?: string;
}

export interface InitiativeSummary extends InitiativeMeta {
  files: string[];
  /** Current stage of the 5-stage flow; null once everything is validated. */
  stage: { n: number; label: string } | null;
}

export interface StepView {
  id: StepId;
  label: string;
  command: string;
  blurb: string;
  output?: string;
  scope: "feature" | "repo" | "handoff";
  inputHint?: string;
  status: StepStatus;
  detail?: string;
  isNext: boolean;
}

export type StageId = "brief" | "spec" | "clarify" | "plan" | "build";

export interface StageView {
  id: StageId;
  n: number;
  label: string;
  summary: string;
  state: "done" | "current" | "upcoming";
  detail?: string;
  steps: StepView[];
}

export interface FileChange {
  scope: DocScope;
  path: string;
  kind: "modified" | "added" | "deleted";
  diff: string;
  workingContent: string | null;
}
