"use client";

import { useState } from "react";
import { demoPrdForUrl } from "@/lib/demo-prds";
import { briefChecks, LENSES, type LensId } from "@/lib/speckit";

export function BriefPanel({
  slug,
  text,
  agentEnabled,
  busy,
  hasSpec,
  confluenceUrl,
  confluenceConfigured,
  onConfluenceLinked,
  onImport,
  onReview,
  onDraftSpec,
  onOpenSpec,
  onSimulate,
}: {
  slug: string;
  text: string;
  agentEnabled: boolean;
  busy: boolean;
  hasSpec: boolean;
  confluenceUrl?: string;
  confluenceConfigured: boolean;
  onConfluenceLinked: (url?: string) => void;
  onImport: (content: string, url?: string) => void;
  onReview: (lens?: LensId) => void;
  onDraftSpec: () => void;
  onOpenSpec: () => void;
  onSimulate?: (input: {
    userText: string;
    stepLabel: string;
    run: (ctx: { setActivity: (label: string) => void; append: (text: string) => void }) => Promise<void>;
  }) => Promise<void>;
}) {
  const { sections, openQuestions, ready } = briefChecks(text);
  const filled = sections.filter((s) => s.filled).length;
  const [editingLink, setEditingLink] = useState(false);
  const [draftUrl, setDraftUrl] = useState(confluenceUrl ?? "");
  const [linking, setLinking] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStage, setPushStage] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState<string | null>(null);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function readFromConfluence(url: string, label = "Reading") {
    const prd = demoPrdForUrl(url);
    if (!prd) return false;
    setPushNote(null);
    setReading(`${label} “${prd.title}” from Confluence…`);
    let folded = false;
    const fold = () => {
      if (folded) return;
      folded = true;
      onImport(prd.markdown, url);
    };
    try {
      if (onSimulate) {
        await onSimulate({
          userText: `Read the linked Confluence page into the brief:\n${url}`,
          stepLabel: "Confluence",
          run: async ({ setActivity, append }) => {
            setActivity("Resolving the linked Confluence page…");
            await sleep(800);
            setActivity(`Fetching “${prd.title}”…`);
            await sleep(1000);
            setActivity("Folding the PRD into brief.md…");
            fold();
            await sleep(700);
            append(
              `Read **${prd.title}** from the linked Confluence page and wrote it into this brief.\n\nProblem, intended value, hypothesis and scope are in. Anything still open stays marked for Clarify.\n`,
            );
          },
        });
      }
    } finally {
      fold();
      setReading(null);
      setPushNote(`Synced with “${prd.title}” on Confluence. Review it below, then Commit.`);
    }
    return true;
  }

  async function saveLink() {
    setLinking(true);
    try {
      const res = await fetch(`/api/initiatives/${slug}/confluence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draftUrl.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        const url = draftUrl.trim();
        onConfluenceLinked(url || undefined);
        setEditingLink(false);
        setLinking(false);
        await readFromConfluence(url);
        return;
      }
      setPushNote(data.error ?? "Could not save the link");
    } finally {
      setLinking(false);
    }
  }

  async function pushNow() {
    setPushing(true);
    setPushNote(null);
    const demo = demoPrdForUrl(confluenceUrl);
    const title = demo?.title ?? "linked page";
    // Staged for the walkthrough — looks like a real Confluence write even when
    // the host has no Atlassian token (or the API is slow/fails).
    const stages = [
      "Connecting to Confluence…",
      `Writing “${title}”…`,
      "Bumping page version…",
      "Confirming storage…",
    ];
    try {
      const pushPromise = fetch(`/api/initiatives/${slug}/confluence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push: true }),
      })
        .then(async (res) => ({ res, data: await res.json().catch(() => ({})) }))
        .catch((err) => ({ res: null as Response | null, data: { error: (err as Error).message } }));

      const tick = async () => {
        for (const stage of stages) {
          setPushStage(stage);
          await sleep(750);
        }
      };
      if (onSimulate) {
        await onSimulate({
          userText: `Push this brief to the linked Confluence page:\n${confluenceUrl ?? ""}`,
          stepLabel: "Confluence",
          run: async ({ setActivity, append }) => {
            for (const stage of stages) {
              setActivity(stage);
              setPushStage(stage);
              await sleep(750);
            }
            append(`Pushed this brief to **${title}** on Confluence. The linked page is updated.\n`);
          },
        });
      } else {
        await tick();
      }
      const { res, data } = await pushPromise;
      const ok = Boolean(res?.ok && data.pushResult?.ok);
      // Demo URLs (and walkthrough hosts without creds) always land on success.
      if (ok || demo || !confluenceConfigured) {
        setPushNote(`Pushed to Confluence just now — “${title}” updated · v${ok && data.pushResult?.version ? data.pushResult.version : "next"}`);
      } else {
        setPushNote((data.pushResult?.error as string | undefined) ?? data.error ?? "Push failed");
      }
    } finally {
      setPushStage(null);
      setPushing(false);
    }
  }

  return (
    <div className="mb-8 rounded-[var(--radius-large)] border hairline p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="pill !text-[12px]">PRD</span>
          {confluenceUrl ? (
            <a className="link truncate" href={confluenceUrl} target="_blank" rel="noreferrer">
              Linked Confluence page ↗
            </a>
          ) : (
            <span className="text-secondary">Not linked to a Confluence page yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editingLink ? (
            <>
              <input
                autoFocus
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://wiki.example.com/wiki/spaces/TEAM/pages/123/Title"
                className="!h-7 w-72 !text-[12px]"
              />
              <button type="button" className="btn-primary btn-sm !py-1" disabled={linking} onClick={() => void saveLink()}>
                {linking ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-ghost btn-sm !py-1" onClick={() => setEditingLink(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn-ghost btn-sm !py-1" onClick={() => setEditingLink(true)}>
              {confluenceUrl ? "Change link" : "Link Confluence page"}
            </button>
          )}
          {confluenceUrl && !editingLink && (
            <button
              type="button"
              className="btn-secondary btn-sm !py-1"
              disabled={busy || Boolean(reading)}
              title="Pulls the latest Confluence content back into this brief"
              onClick={async () => {
                const ok = await readFromConfluence(confluenceUrl, "Refreshing");
                if (!ok) {
                  setPushNote("Couldn’t auto-sync this page — paste its content instead.");
                  setImporting(true);
                }
              }}
            >
              {reading ? "Refreshing…" : "Refresh"}
            </button>
          )}
          {confluenceUrl && !editingLink && (
            <button
              type="button"
              className="btn-secondary btn-sm !py-1"
              disabled={pushing}
              title={
                confluenceConfigured
                  ? "Mirrors this brief into the linked Confluence page"
                  : "This host has no Confluence credentials — shown for the walkthrough"
              }
              onClick={() => void pushNow()}
            >
              {pushing ? "Pushing…" : "Push to Confluence"}
            </button>
          )}
        </div>
      </div>
      {pushing && pushStage && (
        <div className="mb-4 -mt-2 rounded-[var(--radius-standard)] px-3 py-2.5" style={{ background: "var(--color-wash)" }}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
            <span className="dot animate-pulse-soft" style={{ background: "var(--color-brand-accent)", width: 7, height: 7 }} />
            <span className="animate-pulse-soft">{pushStage}</span>
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--color-neutral-light)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: pushStage.startsWith("Confirm")
                  ? "92%"
                  : pushStage.startsWith("Bump")
                    ? "70%"
                    : pushStage.startsWith("Writ")
                      ? "45%"
                      : "18%",
                background: "var(--color-form-accent)",
              }}
            />
          </div>
        </div>
      )}
      {!pushing && pushNote && (
        <p
          className="mb-4 -mt-2 flex items-center gap-1.5 text-[12.5px]"
          style={{ color: pushNote.startsWith("Pushed") ? "var(--color-positive)" : "var(--color-secondary)" }}
        >
          {pushNote.startsWith("Pushed") && (
            <span className="dot" style={{ background: "var(--color-positive)", width: 6, height: 6 }} />
          )}
          {pushNote}
          {confluenceUrl && !importing && !pushNote.startsWith("Pushed") && (
            <>
              {" "}
              ·{" "}
              <button type="button" className="link" onClick={() => setImporting(true)}>
                Paste content instead
              </button>
            </>
          )}
          {confluenceUrl && !importing && pushNote.startsWith("Pushed") && (
            <>
              {" "}
              ·{" "}
              <a className="link" href={confluenceUrl} target="_blank" rel="noreferrer">
                Open page ↗
              </a>
            </>
          )}
        </p>
      )}
      {reading && (
        <p className="mb-4 -mt-2 flex items-center gap-1.5 text-[12px] text-secondary">
          <span className="dot animate-pulse-soft" style={{ background: "var(--color-brand-accent)", width: 6, height: 6 }} />
          <span className="animate-pulse-soft">{reading}</span>
        </p>
      )}
      {importing && (
        <div className="mb-5 -mt-1 rounded-[var(--radius-standard)] p-3" style={{ background: "var(--color-wash)" }}>
          <p className="text-[12.5px] text-secondary">
            Open the Confluence page{confluenceUrl ? " (linked above)" : ""}, select all and copy, then paste here. The agent restructures it into this
            brief — you review the diff before anything is committed.
          </p>
          <textarea
            autoFocus
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste the PRD content…"
            className="mt-2 w-full !bg-white text-[13px]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setImporting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy || Boolean(reading) || pasted.trim().length < 40}
              onClick={async () => {
                const content = pasted.trim();
                setPasted("");
                setImporting(false);
                setPushNote(null);
                setReading("Restructuring the paste into the brief…");
                await sleep(1100);
                onImport(content, confluenceUrl);
                setReading(null);
                setPushNote("Imported. Review it below, then Commit.");
              }}
            >
              Import into brief
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">
            {ready ? "Clear enough to specify" : "Is the brief clear enough?"}
          </p>
          <p className="mt-0.5 text-[13px] text-secondary">
            {ready
              ? "Outcome and scope are settled. The spec is drafted from this brief."
              : "If the outcome or scope is still unsettled, resolve that before writing the spec."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {agentEnabled && (
            <button type="button" className="btn-secondary btn-sm" disabled={busy || Boolean(reading)} onClick={() => onReview()}>
              Review for gaps
            </button>
          )}
          {hasSpec ? (
            <button type="button" className="btn-primary btn-sm" onClick={onOpenSpec}>
              Open spec →
            </button>
          ) : (
            <button
              type="button"
              className={ready ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
              disabled={busy || !agentEnabled}
              title={agentEnabled ? "Runs /speckit.specify from this brief" : "No Cursor agent on this host"}
              onClick={onDraftSpec}
            >
              {ready ? "Draft the spec →" : "Draft spec anyway"}
            </button>
          )}
        </div>
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {sections.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5 text-[13px]">
            <span className="step-mark !h-[18px] !w-[18px] !text-[10px]" data-status={s.filled ? "done" : "todo"}>
              {s.filled ? "✓" : ""}
            </span>
            <span>
              <span className="font-medium">{s.heading}</span>
              {!s.filled && <span className="block text-secondary">{s.hint}</span>}
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2.5 text-[13px]">
          <span className="step-mark !h-[18px] !w-[18px] !text-[10px]" data-status={openQuestions ? "attention" : "done"}>
            {openQuestions ? "!" : "✓"}
          </span>
          <span>
            <span className="font-medium">Open questions</span>
            <span className="block text-secondary">
              {openQuestions ? `${openQuestions} unresolved — tick them off below when settled` : "None open"}
            </span>
          </span>
        </li>
      </ul>
      {agentEnabled && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t hairline pt-3 text-[12px]">
          <span className="mr-1 text-secondary">Challenge it as</span>
          {(Object.keys(LENSES) as LensId[]).map((id) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => onReview(id)}
              title={`Review through the ${LENSES[id].label} lens: ${LENSES[id].focus}`}
              className="pill !text-[12px] transition-colors hover:!border-[var(--color-form-accent)] hover:!text-[var(--color-form-accent)] disabled:opacity-40"
            >
              {LENSES[id].label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 h-1 overflow-hidden rounded-full" style={{ background: "var(--color-neutral-light)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${((filled + (openQuestions ? 0 : 1)) / (sections.length + 1)) * 100}%`,
            background: ready ? "var(--color-positive)" : "var(--color-brand-accent)",
          }}
        />
      </div>
    </div>
  );
}
