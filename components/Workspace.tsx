"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  briefTemplate,
  CONSTITUTION_PATH,
  currentStage,
  fallbackSpec,
  featureDescription,
  analyzeFindings,
  pendingCount,
  STEP_BY_ID,
  type LensId,
} from "@/lib/speckit";
import type { DocRef, InitiativeMeta, StageView, StepId, StepView } from "@/lib/types";
import { ActivityLog } from "./ActivityLog";
import { AgentChat } from "./AgentChat";
import { BriefPanel } from "./BriefPanel";
import { DocPane, type OpenDocHandle } from "./DocPane";
import { FigmaImport } from "./FigmaImport";
import { upsertDesignSection } from "@/lib/demo-figma";
import { JiraExport } from "./JiraExport";
import { ResolveCenter } from "./ResolveCenter";
import { useSharedChat } from "./useSharedChat";

type Selection =
  | { kind: "doc"; doc: DocRef; step?: StepId }
  | { kind: "panel"; step: "analyze" | "implement" }
  | { kind: "activity" };

const STEP_OUTPUTS = new Set(["brief.md", "spec.md", "plan.md", "tasks.md", "analyze.md"]);

function selectionForStep(s: StepView): Selection {
  if (s.id === "implement") return { kind: "panel", step: s.id };
  if (s.id === "constitution") return { kind: "doc", doc: { scope: "repo", path: CONSTITUTION_PATH }, step: s.id };
  return { kind: "doc", doc: { scope: "feature", path: s.output! }, step: s.id };
}

function sameSelection(a: Selection, b: Selection) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "panel" && b.kind === "panel") return a.step === b.step;
  if (a.kind === "doc" && b.kind === "doc") return a.doc.scope === b.doc.scope && a.doc.path === b.doc.path;
  if (a.kind === "activity" && b.kind === "activity") return true;
  return false;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

export function Workspace({
  meta,
  steps,
  stages,
  files,
  hasConstitution,
  featurePath,
  remoteUrl,
  spec,
  tasks,
  analyze,
  tasksReviewed,
  jira,
  agentEnabled,
  model,
  currentUser,
  autorun,
  confluenceConfigured,
  staleness,
}: {
  meta: InitiativeMeta;
  steps: StepView[];
  stages: StageView[];
  files: string[];
  hasConstitution: boolean;
  featurePath: string;
  remoteUrl: string | null;
  spec: string | undefined;
  tasks: string | undefined;
  analyze: string | undefined;
  /** A tasks sign-off exists and is newer than tasks.md / analyze.md. */
  tasksReviewed: boolean;
  jira: { configured: boolean; projectKey: string | null; baseUrl: string | null };
  agentEnabled: boolean;
  model: string;
  currentUser: { login: string; name: string; role?: LensId | null };
  autorun: StepId | null;
  confluenceConfigured: boolean;
  staleness: Partial<Record<"spec" | "plan" | "tasks" | "analyze", boolean>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const openDocRef = useRef<OpenDocHandle | null>(null);
  const register = useCallback((h: OpenDocHandle | null) => {
    openDocRef.current = h;
  }, []);

  // Who you are, fixed at login — drives who gets notified. Separate from `view`,
  // which only highlights one role's questions and never hides the others.
  const role = currentUser.role ?? null;
  const [view, setView] = useState<LensId | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  // Hidden until the count changes — new questions bring the pill back.
  const [dismissedPending, setDismissedPending] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const chat = useSharedChat({
    slug: meta.slug,
    user: currentUser,
    role,
    agentEnabled,
    getOpenDoc: () => {
      const h = openDocRef.current;
      return h && h.dirty() ? { ...h.doc, content: h.content() } : null;
    },
  });

  const pending = pendingCount(spec, chat.messages, role);
  const clarifyDone = steps.find((s) => s.id === "clarify")?.status === "done";
  const planStep = steps.find((s) => s.id === "plan");
  const tasksStep = steps.find((s) => s.id === "tasks");
  const analyzeStep = steps.find((s) => s.id === "analyze");
  const hasPlan = files.includes("plan.md");
  const hasTasks = files.includes("tasks.md");
  const hasAnalyze = files.includes("analyze.md");
  const findings = analyzeFindings(analyze);
  const [confluenceUrl, setConfluenceUrl] = useState<string | undefined>(meta.confluenceUrl);
  const [figmaFrames, setFigmaFrames] = useState(meta.figmaFrames ?? []);
  const current = currentStage(stages);
  const [selection, setSelection] = useState<Selection>(() => {
    const first = (current ?? stages[stages.length - 1]).steps[0] ?? steps.find((s) => s.id === "brief")!;
    return selectionForStep(first);
  });

  // Everyone refreshes file lists and step status when anyone saves or the agent finishes.
  const lastVersion = useRef(chat.changesVersion);
  useEffect(() => {
    if (chat.changesVersion !== lastVersion.current) {
      lastVersion.current = chat.changesVersion;
      router.refresh();
    }
  }, [chat.changesVersion, router]);

  const send = chat.send;
  const autoran = useRef(false);
  useEffect(() => {
    if (!autorun || autoran.current || !chat.ready) return;
    autoran.current = true;
    router.replace(pathname);
    void send({ step: autorun, text: autorun === "specify" ? featureDescription(meta) : "" });
  }, [autorun, chat.ready, send, meta, router, pathname]);

  const fileExists = (doc: DocRef) =>
    doc.scope === "repo" ? hasConstitution : files.includes(doc.path);
  const extraFiles = files.filter((f) => !STEP_OUTPUTS.has(f));
  const activeStep =
    selection.kind === "panel"
      ? STEP_BY_ID[selection.step]
      : selection.kind === "doc" && selection.step
        ? STEP_BY_ID[selection.step]
        : undefined;

  const runStep = (step: StepId, text = "", lens?: LensId) => void send({ step, text, lens });
  const startPlan = () => {
    runStep("plan");
    if (planStep) setSelection(selectionForStep(planStep));
  };
  const startTasks = () => {
    runStep("tasks");
    if (tasksStep) setSelection(selectionForStep(tasksStep));
  };
  const analyzing = Boolean(chat.busy?.step?.startsWith("Analyze"));
  const confirmReviewed = async () => {
    setReviewing(true);
    try {
      const res = await fetch(`/api/initiatives/${meta.slug}/review`, { method: "POST" });
      if (res.ok) chat.bumpChanges();
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_380px]">
      {pending > 0 && pending !== dismissedPending && !resolveOpen && (
        <div
          className="fixed left-1/2 top-[70px] z-40 flex -translate-x-1/2 items-center rounded-full border text-[13px] font-medium shadow-[var(--shadow-medium)]"
          style={{ background: "var(--color-caution-soft)", color: "var(--color-caution-fg)", borderColor: "var(--color-caution-bg)" }}
        >
          <button type="button" onClick={() => setResolveOpen(true)} className="flex items-center gap-2 py-2 pl-4 pr-2">
            <span className="dot" style={{ background: "var(--color-caution-bg)", width: 7, height: 7 }} />
            You have {pending} outstanding clarification{pending > 1 ? "s" : ""}
            <span aria-hidden>→</span>
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss — comes back if new questions arrive"
            onClick={() => setDismissedPending(pending)}
            className="border-l py-2 pl-2.5 pr-3.5 opacity-70 hover:opacity-100"
            style={{ borderColor: "var(--color-caution-bg)" }}
          >
            ✕
          </button>
        </div>
      )}
      <ResolveCenter
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        spec={spec}
        messages={chat.messages}
        role={role}
        busy={Boolean(chat.busy)}
        onAnswer={(message) => runStep("clarify", message)}
        onKickOff={() => runStep("clarify")}
      />
      {/* Rail */}
      <aside className="border-r hairline px-6 pb-8 pt-8 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
        <p className="text-[11px] font-medium uppercase tracking-wide text-secondary">Feature {meta.number}</p>
        <h1 className="mt-1.5 font-display text-[17px] leading-snug">{meta.title}</h1>
        <p className="mt-2 text-xs text-secondary">
          {current ? `Stage ${current.n} of ${stages.length} · ${current.label}` : "All stages validated"}
        </p>

        <ol className="flow mt-8">
          {stages.map((stage) => {
            const inStage = stage.steps.some((st) => sameSelection(selectionForStep(st), selection));
            const showSteps = stage.steps.length > 1 && (stage.state === "current" || inStage);
            const stale =
              stage.id === "spec" ? staleness.spec : stage.id === "plan" ? staleness.plan || staleness.tasks : false;
            return (
              <li key={stage.id} className="flow-stage" data-state={stage.state}>
                <button
                  type="button"
                  className="flow-head"
                  data-active={inStage && !showSteps}
                  onClick={() => stage.steps[0] && setSelection(selectionForStep(stage.steps[0]))}
                >
                  <span className="flow-mark" data-state={stage.state}>
                    {stage.state === "done" && "✓"}
                  </span>
                  <span className="min-w-0 pt-[1px]">
                    <span className="flex items-center gap-1.5">
                      <span className="block text-[15.5px] font-semibold tracking-tight">{stage.label}</span>
                      {stale && (
                        <span
                          className="dot shrink-0"
                          style={{ background: "var(--color-caution-bg)", width: 6, height: 6 }}
                          title="The brief changed since this was last written — may be out of date"
                        />
                      )}
                    </span>
                    {(stage.state === "current" || stage.detail || stale) && (
                      <span className="mt-0.5 block text-xs" style={{ color: stale ? "var(--color-caution-fg)" : "var(--color-secondary)" }}>
                        {stale ? "Brief changed since this was written" : (stage.detail ?? stage.summary)}
                      </span>
                    )}
                  </span>
                </button>
                {showSteps && (
                  <div className="mb-1 mt-0.5 space-y-px">
                    {stage.steps.map((s) => {
                      const sel = selectionForStep(s);
                      return (
                        <button key={s.id} type="button" className="flow-sub" data-active={sameSelection(sel, selection)} onClick={() => setSelection(sel)}>
                          <span className="dot" style={{ background: s.status === "done" ? "var(--color-positive)" : s.status === "attention" ? "var(--color-caution-bg)" : "var(--color-border-strong)" }} />
                          <span className="min-w-0">
                            <span className="block">{s.label}</span>
                            {s.detail && (
                              <span className="block text-[11px] font-normal" style={{ color: s.status === "attention" ? "var(--color-caution-fg)" : "var(--color-secondary)" }}>
                                {s.detail}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-10 border-t hairline pt-5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary">Also here</p>
          {(() => {
            const principles = steps.find((s) => s.id === "constitution");
            if (!principles) return null;
            const sel = selectionForStep(principles);
            return (
              <button type="button" className="flow-sub !pl-1" data-active={sameSelection(sel, selection)} onClick={() => setSelection(sel)}>
                Project principles
              </button>
            );
          })()}
          {extraFiles.map((f) => {
            const sel: Selection = { kind: "doc", doc: { scope: "feature", path: f } };
            return (
              <button key={f} type="button" className="flow-sub !pl-1" data-active={sameSelection(sel, selection)} onClick={() => setSelection(sel)}>
                <span className="truncate">{f.replace(/\.md$/, "").replace(/[-_/]/g, " ")}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="flow-sub !pl-1"
            data-active={selection.kind === "activity"}
            onClick={() => setSelection({ kind: "activity" })}
          >
            Activity — who edited what
          </button>
          {remoteUrl && (
            <a className="flow-sub !pl-1 text-secondary" href={`${remoteUrl}/tree/HEAD/${featurePath}`} target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
          )}
        </div>
      </aside>

      {/* Document */}
      <section className="min-w-0 px-6 pb-10 pt-6 lg:px-12">
        {selection.kind === "activity" ? (
          <ActivityLog slug={meta.slug} remoteUrl={remoteUrl} />
        ) : selection.kind === "doc" && fileExists(selection.doc) ? (
          <DocPane
            key={`${selection.doc.scope}:${selection.doc.path}`}
            slug={meta.slug}
            doc={selection.doc}
            title={activeStep?.label ?? selection.doc.path.split("/").pop()!}
            currentUser={currentUser}
            changesVersion={chat.changesVersion}
            onChanged={chat.bumpChanges}
            register={register}
            onAskAgent={(step) => runStep(step)}
            agentEnabled={agentEnabled}
            remoteUrl={remoteUrl}
            stale={
              selection.step === "specify" || selection.step === "clarify"
                ? staleness.spec
                : selection.step === "plan"
                  ? staleness.plan
                  : selection.step === "tasks"
                    ? staleness.tasks
                    : false
            }
            renderTop={
              selection.step === "brief"
                ? (text, ready) =>
                    ready ? (
                      <>
                        <FigmaImport
                          slug={meta.slug}
                          frames={figmaFrames}
                          busy={Boolean(chat.busy)}
                          onFramesChange={setFigmaFrames}
                          onSimulate={chat.simulate}
                          onCaptured={(next) => {
                            const h = openDocRef.current;
                            if (!h) return;
                            h.replace(upsertDesignSection(h.content(), next));
                          }}
                        />
                        <BriefPanel
                          slug={meta.slug}
                          text={text}
                          agentEnabled={agentEnabled}
                          busy={Boolean(chat.busy)}
                          hasSpec={files.includes("spec.md")}
                          confluenceUrl={confluenceUrl}
                          confluenceConfigured={confluenceConfigured}
                          onConfluenceLinked={setConfluenceUrl}
                          onReview={(lens) => runStep("brief", "", lens)}
                          onSimulate={chat.simulate}
                          onImport={(content) => {
                            const h = openDocRef.current;
                            h?.replace(content);
                            void h?.commit();
                          }}
                          onDraftSpec={() => {
                            runStep("specify");
                            setSelection(selectionForStep(steps.find((s) => s.id === "specify")!));
                          }}
                          onOpenSpec={() => setSelection(selectionForStep(steps.find((s) => s.id === "specify")!))}
                        />
                      </>
                    ) : null
                : selection.step === "specify" || selection.step === "clarify"
                  ? () =>
                      clarifyDone ? (
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-standard)] border hairline px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold">Clarified</p>
                            <p className="mt-0.5 text-[13px] text-secondary">No open questions left in the spec.</p>
                          </div>
                          {hasPlan ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => planStep && setSelection(selectionForStep(planStep))}
                            >
                              Open plan →
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={Boolean(chat.busy) || !agentEnabled}
                              onClick={startPlan}
                            >
                              Start Plan →
                            </button>
                          )}
                        </div>
                      ) : null
                  : selection.step === "plan"
                    ? () => (
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-standard)] border hairline px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold">Plan drafted</p>
                            <p className="mt-0.5 text-[13px] text-secondary">
                              Once this is reviewed — architecture, data, scope — tasks can be generated from it.
                            </p>
                          </div>
                          {hasTasks ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => tasksStep && setSelection(selectionForStep(tasksStep))}
                            >
                              Open tasks →
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={Boolean(chat.busy) || !agentEnabled}
                              onClick={startTasks}
                            >
                              Reviewed — generate tasks →
                            </button>
                          )}
                        </div>
                      )
                    : selection.step === "tasks" || selection.step === "analyze"
                      ? () => (
                          <TasksReviewBanner
                            onTasksPage={selection.step === "tasks"}
                            hasAnalyze={hasAnalyze}
                            analyzing={analyzing}
                            stale={Boolean(staleness.analyze)}
                            findings={findings}
                            reviewed={tasksReviewed}
                            lastReview={meta.tasksReviewed}
                            canRun={agentEnabled && !chat.busy}
                            reviewing={reviewing}
                            onRunAnalyze={() => runStep("analyze")}
                            onViewGaps={() => analyzeStep && setSelection(selectionForStep(analyzeStep))}
                            onConfirm={confirmReviewed}
                          />
                        )
                      : undefined
            }
          />
        ) : (
          <EmptyStep
            step={activeStep}
            agentEnabled={agentEnabled}
            busy={Boolean(chat.busy)}
            remoteUrl={remoteUrl}
            featurePath={featurePath}
            buildExtra={
              <section className="mb-10 border-b hairline pb-10">
                <p className="eyebrow">Ticket the work</p>
                <h2 className="heading-2 mt-3">Tasks → Jira</h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-secondary">
                  One ticket per task in <code>tasks.md</code>, grouped by phase. Edit summaries, types and labels before anything leaves
                  this page.
                </p>
                {!tasksReviewed && tasks && (
                  <p className="mt-3 text-[13px]" style={{ color: "var(--color-caution-fg)" }}>
                    Tasks haven&apos;t been confirmed as reviewed yet — worth doing before they become tickets.
                  </p>
                )}
                <div className="mt-5">
                  {tasks ? (
                    <JiraExport
                      key={`${tasks.length}:${Object.keys(meta.jiraKeys ?? {}).length}`}
                      slug={meta.slug}
                      tasks={tasks}
                      jiraKeys={meta.jiraKeys ?? {}}
                      jira={jira}
                      onCreated={chat.bumpChanges}
                    />
                  ) : (
                    <p className="text-sm text-secondary">Generate tasks first — tickets are built from tasks.md.</p>
                  )}
                </div>
              </section>
            }
            onRun={(text) => activeStep && runStep(activeStep.id, text)}
            onStartBlank={
              selection.kind === "doc"
                ? async () => {
                    const doc = selection.doc;
                    await fetch(`/api/initiatives/${meta.slug}/files?scope=${doc.scope}&path=${encodeURIComponent(doc.path)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        content:
                          doc.path === "brief.md"
                            ? briefTemplate(meta)
                            : doc.path === "spec.md"
                              ? fallbackSpec(meta)
                              : `# ${activeStep?.label ?? doc.path}\n\n`,
                      }),
                    });
                    chat.bumpChanges();
                  }
                : undefined
            }
          />
        )}
      </section>

      {/* Agent */}
      <aside className="border-l hairline lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)]" style={{ background: "var(--color-wash)" }}>
        <AgentChat
          messages={chat.messages}
          busy={chat.busy}
          presence={chat.presence}
          steps={steps}
          agentEnabled={agentEnabled}
          model={model}
          view={view}
          onViewChange={setView}
          selfLogin={currentUser.login}
          onSend={(input) => void send(input)}
          onCancel={() => void chat.cancel()}
        />
      </aside>
    </div>
  );
}

function TasksReviewBanner({
  onTasksPage,
  hasAnalyze,
  analyzing,
  stale,
  findings,
  reviewed,
  lastReview,
  canRun,
  reviewing,
  onRunAnalyze,
  onViewGaps,
  onConfirm,
}: {
  onTasksPage: boolean;
  hasAnalyze: boolean;
  analyzing: boolean;
  stale: boolean;
  findings: ReturnType<typeof analyzeFindings>;
  reviewed: boolean;
  lastReview?: InitiativeMeta["tasksReviewed"];
  canRun: boolean;
  reviewing: boolean;
  onRunAnalyze: () => void;
  onViewGaps: () => void;
  onConfirm: () => void;
}) {
  const serious = findings.critical + findings.high;
  const tone = analyzing || !hasAnalyze || stale || serious > 0 ? "caution" : "plain";

  let title: string;
  let sub: string;
  if (analyzing) {
    title = "Checking tasks against spec and plan…";
    sub = "Analyze runs automatically after Tasks. Findings land in analyze.md.";
  } else if (!hasAnalyze) {
    title = "No consistency check yet";
    sub = "Analyze compares spec, plan and tasks for gaps before anyone builds from them.";
  } else if (stale) {
    title = findings.total
      ? `Analyze found ${findings.total} gap${findings.total > 1 ? "s" : ""}`
      : "Spec, plan or tasks changed since the last check";
    sub = findings.total
      ? "Spec, plan or tasks changed since this check — re-run so the gaps match what's there now."
      : "Re-run Analyze so the findings match what's there now.";
  } else if (findings.total === 0) {
    title = "Analyze found no gaps";
    sub = "Spec, plan and tasks line up.";
  } else {
    title = `Analyze found ${findings.total} gap${findings.total > 1 ? "s" : ""}`;
    sub = [
      findings.critical && `${findings.critical} critical`,
      findings.high && `${findings.high} high`,
      findings.medium && `${findings.medium} medium`,
      findings.low && `${findings.low} low`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const reviewedLine =
    reviewed && lastReview
      ? `Reviewed by ${lastReview.name} · ${new Date(lastReview.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : !reviewed && lastReview
        ? `Last reviewed by ${lastReview.name} — tasks or analysis changed since`
        : null;

  return (
    <div
      className="mb-6 rounded-[var(--radius-standard)] border px-4 py-3"
      style={
        tone === "caution"
          ? { background: "var(--color-caution-soft)", borderColor: "var(--color-caution-bg)" }
          : { borderColor: "var(--color-border)" }
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold" style={tone === "caution" ? { color: "var(--color-caution-fg)" } : undefined}>
            {analyzing && <span className="dot animate-pulse" style={{ background: "var(--color-caution-bg)", width: 7, height: 7 }} />}
            {title}
          </p>
          <p className="mt-0.5 text-[13px] text-secondary">{sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!analyzing && (!hasAnalyze || stale) && (
            <button type="button" className="btn-secondary btn-sm" disabled={!canRun} onClick={onRunAnalyze}>
              {hasAnalyze ? "Re-run Analyze" : "Run Analyze"}
            </button>
          )}
          {!analyzing && hasAnalyze && onTasksPage && findings.total > 0 && (
            <button type="button" className="btn-secondary btn-sm" onClick={onViewGaps}>
              View gaps →
            </button>
          )}
          {reviewed ? (
            <span className="pill !text-[12px]" style={{ borderColor: "var(--color-positive)", color: "var(--color-positive)" }}>
              ✓ Reviewed
            </span>
          ) : (
            <button type="button" className="btn-primary btn-sm" disabled={analyzing || reviewing} onClick={onConfirm}>
              {reviewing ? "Saving…" : "Confirm tasks reviewed"}
            </button>
          )}
        </div>
      </div>
      {reviewedLine && <p className="mt-2 text-[12px] text-secondary">{reviewedLine}</p>}
    </div>
  );
}

function EmptyStep({
  step,
  agentEnabled,
  busy,
  remoteUrl,
  featurePath,
  onRun,
  onStartBlank,
  buildExtra,
}: {
  step?: (typeof STEP_BY_ID)[StepId];
  agentEnabled: boolean;
  busy: boolean;
  remoteUrl: string | null;
  featurePath: string;
  onRun: (text: string) => void;
  onStartBlank?: () => void;
  /** Rendered at the top of the Build & validate panel. */
  buildExtra?: ReactNode;
}) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  if (!step) return null;

  if (step.id === "implement") {
    const cmd = `/speckit.implement ${featurePath}`;
    return (
      <div className="pt-10">
        {buildExtra}
      <div className="max-w-xl pt-4">
        <p className="eyebrow">{step.command}</p>
        <h2 className="heading-2 mt-3">Build it where the code lives</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-secondary">
          Implementation happens in the product repo, not here. An engineer opens the specs alongside the code in Cursor and runs the
          command below — the agent works through <code>tasks.md</code> and ticks tasks off as it goes.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-[var(--radius-standard)] border hairline px-4 py-3">
          <code className="flex-1 truncate text-sm">{cmd}</code>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              await copy(cmd);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {remoteUrl && (
          <a className="btn-secondary mt-4" href={`${remoteUrl}/tree/HEAD/${featurePath}`} target="_blank" rel="noreferrer">
            Open specs on GitHub
          </a>
        )}
      </div>
      </div>
    );
  }

  const isAnalyze = step.id === "analyze";
  return (
    <div className="max-w-xl pt-16">
      <p className="eyebrow">{step.command}</p>
      <h2 className="heading-2 mt-3">{step.label}</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-secondary">{step.blurb}</p>
      {isAnalyze && (
        <p className="mt-2 text-sm text-secondary">
          The agent reads spec, plan and tasks — nothing there is edited. Findings land here, in analyze.md, not in the chat.
        </p>
      )}
      {agentEnabled ? (
        <div className="mt-8">
          {step.inputHint && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={`${step.inputHint} (optional)`}
              className="w-full"
            />
          )}
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => onRun(note)}>
              {busy ? "Agent is busy…" : `Run ${step.label}`}
            </button>
            {onStartBlank && (
              <button type="button" className="btn-ghost" onClick={onStartBlank}>
                Write it myself
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-secondary">
            Same as typing <code>{step.command}</code> — the agent&apos;s draft arrives as a proposal you review before it&apos;s committed.
          </p>
        </div>
      ) : (
        onStartBlank && (
          <button type="button" className="btn-primary mt-8" onClick={onStartBlank}>
            Start writing
          </button>
        )
      )}
    </div>
  );
}
