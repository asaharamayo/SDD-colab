"use client";

import { useEffect, useRef, useState } from "react";
import { LENSES, type LensId } from "@/lib/speckit";
import type { StepId, StepView } from "@/lib/types";
import { Markdown } from "./Markdown";
import type { AgentBusy, ChatMessage, Presence } from "./useSharedChat";

export function AgentChat({
  messages,
  busy,
  presence,
  steps,
  agentEnabled,
  model,
  view,
  onViewChange,
  selfLogin,
  onSend,
  onCancel,
}: {
  messages: ChatMessage[];
  busy: AgentBusy | null;
  presence: Presence[];
  steps: StepView[];
  agentEnabled: boolean;
  model: string;
  /** Which role's questions to emphasise. A lens, not a gate — everything stays visible. */
  view: LensId | null;
  onViewChange: (view: LensId | null) => void;
  /** The logged-in handle — a notice only toasts for the person it's addressed to. */
  selfLogin: string;
  onSend: (input: { step?: StepId; text: string }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const runnable = steps.filter((s) => s.scope !== "handoff");
  const next = steps.find((s) => s.isNext);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(step?: StepId) {
    if (busy) return;
    const text = draft.trim();
    if (!step && !text) return;
    onSend({ step, text });
    setDraft("");
    setHint(null);
  }

  const notices = messages.filter(
    (m) => m.role === "notice" && m.toLogin === selfLogin && !m.toRole && !dismissed.includes(m.id),
  );

  return (
    <div className="flex h-full flex-col">
      {notices.length > 0 && (
        <div className="fixed bottom-5 right-5 z-40 flex w-80 flex-col gap-2">
          {notices.map((n) => (
            <div key={n.id} className="rounded-[var(--radius-standard)] border hairline bg-white p-3.5 shadow-[var(--shadow-medium)]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-semibold">
                  {n.title ?? "Notice"}
                </p>
                <button type="button" className="btn-ghost btn-sm !py-0" onClick={() => setDismissed((d) => [...d, n.id])}>
                  ✕
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-secondary">{n.text}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <span className="dot" style={{ background: agentEnabled ? "var(--color-brand-accent)" : "var(--color-field)" }} />
            {agentEnabled ? "Cursor agent" : "Team chat"}
          </div>
          <p className="mt-0.5 text-xs text-secondary">
            {agentEnabled ? `${model} · shared with everyone here` : "No agent on this host"}
          </p>
        </div>
        <div className="flex -space-x-1.5">
          {presence.map((p) => (
            <span
              key={p.clientId}
              title={`${p.self ? `${p.name} (you)` : p.name}${p.role ? ` · ${LENSES[p.role].label}` : ""}`}
              style={{ backgroundColor: p.color }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white"
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b hairline px-5 py-2.5 text-[12px]">
        <span className="mr-0.5 text-secondary">Highlight</span>
        {(Object.keys(LENSES) as LensId[]).map((id) => (
          <button
            key={id}
            type="button"
            data-active={view === id}
            onClick={() => onViewChange(view === id ? null : id)}
            title={`Emphasise the ${LENSES[id].label} questions. You can still read every other role's.`}
            className="pill !text-[11px] !py-0.5 transition-colors data-[active=true]:!border-[var(--color-form-accent)] data-[active=true]:!bg-[var(--color-form-accent-soft)] data-[active=true]:!text-[var(--color-form-accent)]"
          >
            {LENSES[id].label}
          </button>
        ))}
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="pt-6 text-sm leading-relaxed text-secondary">
            <p className="font-medium text-[var(--color-neutral)]">Ask anything about this feature.</p>
            <p className="mt-1.5">
              Or click a step below — it sends the same instruction as typing the Spec Kit command
              {next ? (
                <>
                  , e.g. <code>{next.command}</code>
                </>
              ) : null}
              .
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.role === "notice" ? null : m.role === "note" ? (
            <p key={m.id} className="text-center text-xs text-secondary">
              {m.text}
            </p>
          ) : m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end">
              <span className="mb-1 text-[11px] font-medium" style={{ color: m.color }}>
                {m.author}
              </span>
              <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-3.5 py-2 text-sm" style={{ background: "var(--color-neutral-light)" }}>
                {m.command ? (
                  <>
                    <code className="font-semibold" style={{ color: "var(--color-form-accent)" }}>
                      {m.command}
                    </code>
                    {m.text.slice(m.command.length)}
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-secondary">
                <span className="dot" style={{ background: "var(--color-brand-accent)", width: 6, height: 6 }} />
                Agent
                {m.status === "streaming" && <span className="animate-pulse-soft">· working</span>}
                {m.status === "cancelled" && <span>· stopped</span>}
              </span>
              {m.activity && m.activity.length > 0 && (
                <ul className="mb-1.5 space-y-0.5 text-[12px] text-secondary">
                  {m.activity.map((a, i) => (
                    <li key={i} className="font-mono">
                      · {a}
                    </li>
                  ))}
                </ul>
              )}
              {m.text ? (
                <Markdown source={m.text} className="prose-doc prose-chat" />
              ) : m.status === "streaming" ? (
                <span className="text-sm text-secondary animate-pulse-soft">Thinking…</span>
              ) : null}
            </div>
          ),
        )}
      </div>

      <div className="border-t hairline px-4 pb-4 pt-3">
        {busy && (
          <div className="mb-2.5 rounded-[var(--radius-standard)] px-3 py-2 text-xs" style={{ background: "var(--color-wash)" }}>
            <div className="flex items-center justify-between">
              <span className="animate-pulse-soft">
                {busy.by} is running {busy.step ?? "a request"} — everyone sees the output live
              </span>
              <button type="button" className="btn-ghost btn-sm !py-1" onClick={onCancel}>
                Stop
              </button>
            </div>
            <p className="mt-1 text-[11px] text-secondary">One shared agent run per feature — your buttons unlock when this finishes.</p>
          </div>
        )}
        <div className="mb-2.5 flex flex-wrap gap-1.5" style={{ opacity: busy ? 0.45 : 1, pointerEvents: busy ? "none" : undefined }}>
          {runnable.map((s) => (
            <button
              key={s.id}
              type="button"
              title={`${s.command} — ${s.blurb}`}
              disabled={!agentEnabled || !!busy}
              onMouseEnter={() => setHint(s.inputHint ?? null)}
              onMouseLeave={() => setHint(null)}
              onClick={() => submit(s.id)}
              className="pill !text-[12px] transition-colors hover:!border-[var(--color-form-accent)] hover:!text-[var(--color-form-accent)] disabled:opacity-40"
              style={s.isNext ? { borderColor: "var(--color-brand-accent-light)", color: "var(--color-neutral)" } : undefined}
            >
              {s.isNext && <span className="dot" style={{ background: "var(--color-brand-accent)", width: 6, height: 6 }} />}
              {s.label}
            </button>
          ))}
        </div>
        <div className="rounded-[var(--radius-large)] border hairline focus-within:border-[var(--color-form-accent)] focus-within:shadow-[0_0_0_4px_var(--color-focus)]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={hint ?? (agentEnabled ? "Ask the agent, or type /speckit.plan …" : "Message the team…")}
            className="block w-full resize-none !border-0 !bg-transparent !shadow-none px-3.5 pt-3 text-sm"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[11px] text-secondary">
              {agentEnabled ? "Text here is passed to the step you click" : "Enter to send"}
            </span>
            <button type="button" className="btn-primary btn-sm" disabled={!!busy || !draft.trim()} onClick={() => submit()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
