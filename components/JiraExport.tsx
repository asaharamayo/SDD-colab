"use client";

import { useState } from "react";
import { ISSUE_TYPES, ticketsFromTasks, ticketsToCsv, type DraftTicket } from "@/lib/tickets";

const TYPE_META: Record<string, { color: string; glyph: string }> = {
  Task: { color: "#2b7fd4", glyph: "✓" },
  Story: { color: "#3cad5e", glyph: "▤" },
  Bug: { color: "#e2483d", glyph: "✕" },
  Spike: { color: "#8c6fe0", glyph: "◆" },
};
function typeMeta(issueType: string) {
  return TYPE_META[issueType] ?? TYPE_META.Task;
}

function TypeBadge({ issueType }: { issueType: string }) {
  const meta = typeMeta(issueType);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]">
      <span
        className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold text-white"
        style={{ background: meta.color }}
      >
        {meta.glyph}
      </span>
      {issueType}
    </span>
  );
}

export function JiraExport({
  slug,
  tasks,
  jiraKeys,
  jira,
  onCreated,
}: {
  slug: string;
  tasks: string;
  jiraKeys: Record<string, string>;
  jira: { configured: boolean; projectKey: string | null; baseUrl: string | null };
  onCreated: () => void;
}) {
  const [tickets, setTickets] = useState<DraftTicket[]>(() => ticketsFromTasks(tasks, slug, jiraKeys));
  const [showDone, setShowDone] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const update = (id: string, patch: Partial<DraftTicket>) =>
    setTickets((ts) => ts.map((t) => (t.taskId === id ? { ...t, ...patch } : t)));

  const visible = tickets.filter((t) => showDone || !t.done);
  const preview = visible.find((t) => t.taskId === previewId) ?? visible[0] ?? null;
  const selected = tickets.filter((t) => t.include && !jiraKeys[t.taskId]);
  const doneCount = tickets.filter((t) => t.done).length;
  const allVisibleOn = visible.length > 0 && visible.every((t) => t.include || jiraKeys[t.taskId]);

  const download = () => {
    const blob = new Blob([ticketsToCsv(selected)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-jira.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const create = async () => {
    if (!jira.configured || !selected.length) return;
    if (!window.confirm(`Create ${selected.length} issue${selected.length > 1 ? "s" : ""} in Jira project ${jira.projectKey}?`)) return;
    setCreating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/initiatives/${slug}/jira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: selected.map(({ taskId, summary, description, issueType, labels }) => ({ taskId, summary, description, issueType, labels })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      const made = Object.keys(body.created ?? {}).length;
      const failed = (body.errors ?? []) as { taskId: string; error: string }[];
      setResult(
        `${made} created${failed.length ? ` · ${failed.length} failed: ${failed.map((e) => `${e.taskId} (${e.error})`).join("; ")}` : ""}`,
      );
      if (made) onCreated();
    } catch (err) {
      setResult((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (!tickets.length) {
    return (
      <p className="text-sm text-secondary">
        No tasks found in <code>tasks.md</code> — expected lines like <code>- [ ] T001 [P] [US1] Description</code>.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-secondary">
          {tickets.length} tasks · {selected.length} selected
          {doneCount > 0 && ` · ${doneCount} already done`}
          {Object.keys(jiraKeys).length > 0 && ` · ${Object.keys(jiraKeys).length} already in Jira`}
        </p>
        <div className="flex items-center gap-3 text-[13px]">
          {doneCount > 0 && (
            <label className="flex items-center gap-1.5 text-secondary">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Show done tasks
            </label>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setTickets(ticketsFromTasks(tasks, slug, jiraKeys))}>
            Reset from tasks.md
          </button>
        </div>
      </div>

      {preview && (
        <TicketPreview
          key={preview.taskId}
          ticket={preview}
          jiraKey={jiraKeys[preview.taskId]}
          jira={jira}
          onChange={(patch) => update(preview.taskId, patch)}
        />
      )}

      <p className="mb-1.5 mt-5 text-[11px] font-medium uppercase tracking-wide text-secondary">All tasks</p>
      <div className="overflow-x-auto rounded-[var(--radius-standard)] border hairline">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b hairline text-left text-[11px] uppercase tracking-wide text-secondary">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allVisibleOn}
                  onChange={(e) => {
                    const ids = new Set(visible.map((t) => t.taskId));
                    setTickets((ts) => ts.map((t) => (ids.has(t.taskId) && !jiraKeys[t.taskId] ? { ...t, include: e.target.checked } : t)));
                  }}
                />
              </th>
              <th className="px-2 py-2 font-medium">Summary</th>
              <th className="w-28 px-2 py-2 font-medium">Type</th>
              <th className="w-44 px-2 py-2 font-medium">Labels</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => {
              const key = jiraKeys[t.taskId];
              const prevPhase = i > 0 ? visible[i - 1].phase : null;
              return (
                <TaskRow
                  key={t.taskId}
                  phaseHeader={t.phase && t.phase !== prevPhase ? t.phase : null}
                  ticket={t}
                  jiraKey={key}
                  active={preview?.taskId === t.taskId}
                  onPreview={() => setPreviewId(t.taskId)}
                  onToggleInclude={(include) => update(t.taskId, { include })}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-secondary">
          {jira.configured
            ? `Creates issues in ${jira.projectKey}. Created keys are saved, so nothing is ticketed twice.`
            : "Jira isn't connected on this host. Download the CSV and use Jira's External System Import → CSV."}
          {" "}Edits here shape the tickets only — tasks.md stays as is.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={!selected.length} onClick={download}>
            Download CSV ({selected.length})
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!jira.configured || !selected.length || creating}
            title={jira.configured ? undefined : "Set JIRA_PROJECT_KEY and Atlassian credentials on the host to enable"}
            onClick={create}
          >
            {creating ? "Creating…" : `Create ${selected.length} in Jira`}
          </button>
        </div>
      </div>
      {result && <p className="mt-2 text-[12.5px]">{result}</p>}
    </div>
  );
}

/** Read-only row — the backlog list. Click a row to load it into the preview/editor above. */
function TaskRow({
  phaseHeader,
  ticket: t,
  jiraKey,
  active,
  onPreview,
  onToggleInclude,
}: {
  phaseHeader: string | null;
  ticket: DraftTicket;
  jiraKey?: string;
  active: boolean;
  onPreview: () => void;
  onToggleInclude: (include: boolean) => void;
}) {
  const locked = Boolean(jiraKey);
  return (
    <>
      {phaseHeader && (
        <tr>
          <td colSpan={4} className="bg-[var(--color-wash)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
            {phaseHeader}
          </td>
        </tr>
      )}
      <tr
        className="cursor-pointer border-b hairline align-middle"
        style={{ opacity: t.done && !locked ? 0.55 : 1, background: active ? "var(--color-form-accent-soft)" : undefined }}
        onClick={onPreview}
      >
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={locked || t.include} disabled={locked} onChange={(e) => onToggleInclude(e.target.checked)} />
        </td>
        <td className="px-2 py-2 text-[13px]">
          <span className="line-clamp-1">
            {jiraKey && <span className="mr-1.5 font-mono text-[11px] text-secondary">{jiraKey}</span>}
            {t.summary}
          </span>
        </td>
        <td className="px-2 py-2">
          <TypeBadge issueType={t.issueType} />
        </td>
        <td className="px-2 py-2 text-[12px] text-secondary">
          <span className="line-clamp-1">{t.labels.join(", ") || "—"}</span>
        </td>
      </tr>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-secondary">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** A mock-up of the Jira issue screen — this is the actual editor; the table above is just the backlog list. */
function TicketPreview({
  ticket: t,
  jiraKey,
  jira,
  onChange,
}: {
  ticket: DraftTicket;
  jiraKey?: string;
  jira: { projectKey: string | null; baseUrl: string | null };
  onChange: (patch: Partial<DraftTicket>) => void;
}) {
  const [editingLabels, setEditingLabels] = useState(false);
  const locked = Boolean(jiraKey);
  const meta = typeMeta(t.issueType);
  const keyLabel = jiraKey ?? (jira.projectKey ? `${jira.projectKey}-draft` : "not yet created");

  return (
    <section className="mt-4">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary">
        Preview — how this lands in Jira{!locked && " (click any field to edit)"}
      </p>
      <div className="overflow-hidden rounded-[var(--radius-standard)] border hairline bg-white shadow-[var(--shadow-small)]">
        <div className="flex items-center gap-2 border-b hairline bg-[var(--color-wash)] px-5 py-2.5 text-[12px] text-secondary">
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold text-white"
            style={{ background: meta.color }}
          >
            {meta.glyph}
          </span>
          <span className="font-medium text-[var(--color-neutral)]">{t.issueType}</span>
          <span className="text-[var(--color-border-strong)]">/</span>
          {jiraKey && jira.baseUrl ? (
            <a className="link" href={`${jira.baseUrl}/browse/${jiraKey}`} target="_blank" rel="noreferrer">
              {jiraKey} ↗
            </a>
          ) : (
            <span className={jiraKey ? undefined : "italic"}>{keyLabel}</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[1fr_190px]">
          <div className="min-w-0">
            {locked ? (
              <h3 className="text-[18px] font-semibold leading-snug">{t.summary}</h3>
            ) : (
              <input
                value={t.summary}
                onChange={(e) => onChange({ summary: e.target.value })}
                placeholder="Summary"
                className="jira-field w-full text-[18px] font-semibold leading-snug"
              />
            )}

            <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-secondary">Description</p>
            {locked ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{t.description || "No description."}</p>
            ) : (
              <textarea
                value={t.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={7}
                className="jira-field w-full text-[13.5px] leading-relaxed"
              />
            )}
          </div>

          <div className="space-y-4 border-t hairline pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <Field label="Status">
              <span className="pill !text-[11px]">{locked ? "To Do" : "Not created"}</span>
            </Field>
            <Field label="Type">
              {locked ? (
                <TypeBadge issueType={t.issueType} />
              ) : (
                <select
                  value={t.issueType}
                  onChange={(e) => onChange({ issueType: e.target.value })}
                  className="jira-field ticket-select w-full"
                >
                  {ISSUE_TYPES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Labels">
              {locked ? (
                <div className="flex flex-wrap gap-1">
                  {t.labels.length ? t.labels.map((l) => <span key={l} className="chip">{l}</span>) : <span className="text-[12px] text-secondary">—</span>}
                </div>
              ) : editingLabels ? (
                <input
                  autoFocus
                  defaultValue={t.labels.join(", ")}
                  onBlur={(e) => {
                    onChange({ labels: e.target.value.split(",").map((l) => l.trim()).filter(Boolean) });
                    setEditingLabels(false);
                  }}
                  placeholder="comma, separated"
                  className="jira-field w-full text-[12.5px]"
                />
              ) : (
                <button
                  type="button"
                  className="flex min-h-[1.5rem] w-full flex-wrap gap-1 rounded-[var(--radius-standard)] text-left hover:bg-[var(--color-wash)]"
                  onClick={() => setEditingLabels(true)}
                  title="Click to edit labels"
                >
                  {t.labels.length ? t.labels.map((l) => <span key={l} className="chip">{l}</span>) : <span className="text-[12px] text-secondary">Add labels…</span>}
                </button>
              )}
            </Field>
            <Field label="Source task">
              <span className="font-mono text-[12px] text-secondary">{t.taskId}</span>
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}
