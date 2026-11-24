"use client";

import { useState } from "react";
import { LENSES, latestTaggedQuestions, specChecks, type LensId, type TaggedQuestion } from "@/lib/speckit";
import type { ChatMessage } from "./useSharedChat";

type Staged =
  | { kind: "question"; text: string; answer: string }
  | { kind: "confirm"; text: string }
  | { kind: "correct"; text: string; correction: string };

function composeMessage(staged: Staged[]): string {
  return staged
    .map((s) =>
      s.kind === "question"
        ? `Q: ${s.text} → A: ${s.answer}`
        : s.kind === "confirm"
          ? `Confirmed: ${s.text}`
          : `Correction to assumption: ${s.text} → ${s.correction}`,
    )
    .join("\n");
}

function QuestionItem({
  q,
  mine,
  staged,
  onStage,
}: {
  q: TaggedQuestion;
  mine: boolean;
  staged: Staged | undefined;
  onStage: (a: Staged | undefined) => void;
}) {
  return (
    <li className="py-2.5">
      <p className="text-[13px] leading-relaxed">{q.text}</p>
      {!mine ? (
        <p className="mt-1 text-[11px] text-secondary">Only the tagged role can resolve this.</p>
      ) : q.options.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {q.options.map((opt) => {
            const selected = staged?.kind === "question" && staged.answer === opt;
            return (
              <button
                key={opt}
                type="button"
                data-active={selected}
                className="pill !text-[12px] transition-colors data-[active=true]:!border-[var(--color-form-accent)] data-[active=true]:!bg-[var(--color-form-accent-soft)] data-[active=true]:!text-[var(--color-form-accent)]"
                onClick={() => onStage(selected ? undefined : { kind: "question", text: q.text, answer: opt })}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          value={staged?.kind === "question" ? staged.answer : ""}
          onChange={(e) =>
            onStage(e.target.value.trim() ? { kind: "question", text: q.text, answer: e.target.value } : undefined)
          }
          placeholder="Your answer…"
          className="mt-1.5 !h-8 w-full !text-[13px]"
        />
      )}
    </li>
  );
}

function AssumptionItem({
  text,
  mine,
  staged,
  onStage,
}: {
  text: string;
  mine: boolean;
  staged: Staged | undefined;
  onStage: (a: Staged | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="py-2.5">
      <p className="text-[13px] leading-relaxed">{text}</p>
      {!mine ? (
        <p className="mt-1 text-[11px] text-secondary">Only the tagged role can resolve this.</p>
      ) : (
        <>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              data-active={staged?.kind === "confirm"}
              className="pill !text-[12px] data-[active=true]:!border-[var(--color-form-accent)] data-[active=true]:!bg-[var(--color-form-accent-soft)] data-[active=true]:!text-[var(--color-form-accent)]"
              onClick={() => onStage(staged?.kind === "confirm" ? undefined : { kind: "confirm", text })}
            >
              ✓ Looks right
            </button>
            <button
              type="button"
              data-active={editing}
              className="pill !text-[12px] data-[active=true]:!border-[var(--color-form-accent)] data-[active=true]:!bg-[var(--color-form-accent-soft)] data-[active=true]:!text-[var(--color-form-accent)]"
              onClick={() => setEditing((v) => !v)}
            >
              ✎ Correct it
            </button>
          </div>
          {editing && (
            <input
              autoFocus
              value={staged?.kind === "correct" ? staged.correction : ""}
              onChange={(e) =>
                onStage(e.target.value.trim() ? { kind: "correct", text, correction: e.target.value } : undefined)
              }
              placeholder="What's actually true…"
              className="mt-1.5 !h-8 w-full !text-[13px]"
            />
          )}
        </>
      )}
    </li>
  );
}

function ResolveCenterInner({
  spec,
  messages,
  role,
  busy,
  onAnswer,
  onKickOff,
  onClose,
}: {
  spec: string | undefined;
  messages: ChatMessage[];
  role: LensId | null;
  busy: boolean;
  onAnswer: (message: string) => void;
  onKickOff: () => void;
  onClose: () => void;
}) {
  const { open: markerCount, assumptions } = specChecks(spec);
  const latest = latestTaggedQuestions(messages);
  const tagged = latest?.tagged ?? {};
  const openAssumptions = assumptions.filter((a) => !a.resolved);
  const untagged = openAssumptions.filter((a) => !a.role);
  const triaged = Boolean(latest);
  // Markers exist in spec.md but Clarify hasn't run this round, so there's no role
  // breakdown for the questions yet — assumptions still show below regardless.
  const showKickOff = !triaged && markerCount > 0;

  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const stage = (key: string, a: Staged | undefined) =>
    setStaged((m) => {
      const next = { ...m };
      if (a) next[key] = a;
      else delete next[key];
      return next;
    });

  const roles: LensId[] = role
    ? [role, ...(["product", "engineering", "quality"] as LensId[]).filter((r) => r !== role)]
    : (["product", "engineering", "quality"] as LensId[]);

  const totalItems = Object.values(tagged).reduce((n, qs) => n + (qs?.length ?? 0), 0) + openAssumptions.length;
  const nothingAtAll = !showKickOff && totalItems === 0;
  const count = Object.keys(staged).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[min(820px,90vh)] w-full max-w-6xl flex-col rounded-[var(--radius-standard)] border hairline bg-white shadow-[var(--shadow-medium)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b hairline px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Outstanding clarifications</p>
            <p className="mt-0.5 text-[12px] text-secondary">
              {totalItems} item{totalItems === 1 ? "" : "s"} open
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm !py-1" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {nothingAtAll && <p className="py-6 text-center text-[13px] text-secondary">Nothing outstanding. Clean slate.</p>}

          {showKickOff && (
            <div className="flex flex-col items-center gap-3 border-b hairline py-6 text-center">
              <p className="text-[13px] text-secondary">
                The spec has <code>[NEEDS CLARIFICATION]</code> markers, but nobody&apos;s run Clarify yet this round — there&apos;s no
                role breakdown for the questions yet.
              </p>
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={onKickOff}>
                Run Clarify →
              </button>
            </div>
          )}

          {roles.map((r) => {
            const qs = tagged[r] ?? [];
            const as = openAssumptions.filter((a) => a.role === r);
            if (qs.length === 0 && as.length === 0) return null;
            const mine = role === r;
            return (
              <div key={r} className="border-t hairline py-3 first:border-t-0 first:pt-0">
                <p
                  className="text-[11px] uppercase tracking-wide"
                  style={
                    mine
                      ? { color: "var(--color-form-accent)", fontWeight: 700 }
                      : { color: "var(--color-secondary)", fontWeight: 500 }
                  }
                >
                  {LENSES[r].label}
                </p>
                {qs.length > 0 && (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {qs.map((q, i) => (
                      <QuestionItem key={`q:${r}:${i}`} q={q} mine={mine} staged={staged[`q:${r}:${i}`]} onStage={(a) => stage(`q:${r}:${i}`, a)} />
                    ))}
                  </ul>
                )}
                {as.length > 0 && (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {as.map((a, i) => (
                      <AssumptionItem
                        key={`a:${r}:${i}`}
                        text={a.text}
                        mine={mine}
                        staged={staged[`a:${r}:${i}`]}
                        onStage={(v) => stage(`a:${r}:${i}`, v)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {untagged.length > 0 && (
            <div className="border-t hairline py-3 first:border-t-0 first:pt-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-secondary">Unassigned</p>
              <p className="text-[11px] text-secondary">No role tag yet — written before role-tagging was on. Open to anyone.</p>
              <ul className="divide-y divide-[var(--color-border)]">
                {untagged.map((a, i) => (
                  <AssumptionItem key={`u:${i}`} text={a.text} mine staged={staged[`u:${i}`]} onStage={(v) => stage(`u:${i}`, v)} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t hairline px-5 py-3">
          <p className="text-[12px] text-secondary">{count > 0 ? `${count} staged` : "Pick answers above, then submit together"}</p>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy || count === 0}
            onClick={() => {
              onAnswer(composeMessage(Object.values(staged)));
              onClose();
            }}
          >
            Submit {count > 0 ? count : ""} answer{count === 1 ? "" : "s"} →
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResolveCenter(props: {
  open: boolean;
  onClose: () => void;
  spec: string | undefined;
  messages: ChatMessage[];
  role: LensId | null;
  busy: boolean;
  onAnswer: (message: string) => void;
  onKickOff: () => void;
}) {
  if (!props.open) return null;
  return <ResolveCenterInner {...props} />;
}
