"use client";

import { useState } from "react";
import {
  DEMO_FIGMA_FRAME,
  DEMO_FIGMA_FRAME_2,
  figmaSimScript,
  nameForFigmaUrl,
  runFigmaSim,
} from "@/lib/demo-figma";
import type { FigmaFrame } from "@/lib/types";

/**
 * Walkthrough mock — Confluence-style link bar for Figma frames.
 * Multiple frames; each shows linked vs uploaded. No real Figma API.
 */
export function FigmaImport({
  slug,
  frames,
  busy,
  onFramesChange,
  onSimulate,
  onCaptured,
}: {
  slug: string;
  frames: FigmaFrame[];
  busy: boolean;
  onFramesChange: (frames: FigmaFrame[]) => void;
  onSimulate: (input: {
    userText: string;
    command?: string;
    stepLabel: string;
    run: (ctx: { setActivity: (label: string) => void; append: (text: string) => void }) => Promise<void>;
  }) => Promise<void>;
  onCaptured?: (frames: FigmaFrame[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draftUrl, setDraftUrl] = useState(frames.length === 0 ? DEMO_FIGMA_FRAME : DEMO_FIGMA_FRAME_2);
  const [saving, setSaving] = useState(false);
  const [runningUrl, setRunningUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const uploaded = frames.filter((f) => f.uploadedAt).length;

  async function persist(next: FigmaFrame[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/initiatives/${slug}/figma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error ?? "Could not save Figma links");
        return false;
      }
      onFramesChange(next);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function addLink() {
    const url = draftUrl.trim();
    if (!url) return;
    if (frames.some((f) => f.url === url)) {
      setStatus("That frame is already linked.");
      setAdding(false);
      return;
    }
    const next = [...frames, { url, name: nameForFigmaUrl(url) }];
    const ok = await persist(next);
    if (ok) {
      setAdding(false);
      setDraftUrl(DEMO_FIGMA_FRAME_2);
      setStatus(`Linked “${nameForFigmaUrl(url)}” — upload it to pull the design onto the brief.`);
    }
  }

  async function unlink(url: string) {
    const next = frames.filter((f) => f.url !== url);
    const ok = await persist(next);
    if (ok) {
      onCaptured?.(next);
      setStatus(next.length ? "Frame unlinked." : "No Figma frames linked.");
    }
  }

  async function upload(frame: FigmaFrame) {
    if (runningUrl || busy) return;
    setRunningUrl(frame.url);
    setStatus(`Queued “${frame.name}”…`);
    const already = frames.filter((f) => f.uploadedAt && f.url !== frame.url).length;
    try {
      await onSimulate({
        userText: `Read this Figma frame onto the brief:\n${frame.url}`,
        stepLabel: "Figma frame",
        run: async ({ setActivity, append }) => {
          setStatus(`Reading “${frame.name}”…`);
          let marked = false;
          await runFigmaSim(
            figmaSimScript(frame, already),
            (label) => {
              setActivity(label);
              setStatus(label);
              if (!marked && (label.startsWith("Writing") || label.startsWith("Refreshing"))) {
                marked = true;
                const next = frames.map((f) =>
                  f.url === frame.url ? { ...f, uploadedAt: new Date().toISOString() } : f,
                );
                void persist(next).then((ok) => {
                  if (ok) onCaptured?.(next);
                });
              }
            },
            append,
          );
          setStatus(`Uploaded “${frame.name}” — on the brief under Design.`);
        },
      });
    } finally {
      setRunningUrl(null);
    }
  }

  return (
    <div className="mb-6 rounded-[var(--radius-large)] border hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4 text-[13px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="pill !text-[12px]">Figma</span>
          {frames.length === 0 ? (
            <span className="text-secondary">No frames linked yet</span>
          ) : (
            <span className="text-secondary">
              {frames.length} linked
              {uploaded > 0 && ` · ${uploaded} uploaded`}
              {uploaded < frames.length && ` · ${frames.length - uploaded} waiting`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {adding ? (
            <>
              <input
                autoFocus
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://www.figma.com/design/…?node-id=…"
                className="!h-7 w-72 !text-[12px]"
              />
              <button type="button" className="btn-primary btn-sm !py-1" disabled={saving || !draftUrl.trim()} onClick={() => void addLink()}>
                {saving ? "Saving…" : "Link"}
              </button>
              <button type="button" className="btn-ghost btn-sm !py-1" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn-ghost btn-sm !py-1" disabled={busy || Boolean(runningUrl)} onClick={() => setAdding(true)}>
              {frames.length ? "Add another frame" : "Link Figma frame"}
            </button>
          )}
        </div>
      </div>

      {frames.length > 0 && (
        <ul className="mt-3 space-y-2">
          {frames.map((f) => {
            const isRunning = runningUrl === f.url;
            const uploaded = Boolean(f.uploadedAt);
            return (
              <li
                key={f.url}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-standard)] px-3 py-2"
                style={{ background: uploaded ? "var(--color-wash)" : undefined, border: uploaded ? undefined : "1px dashed var(--color-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a className="link truncate text-[13px] font-medium" href={f.url} target="_blank" rel="noreferrer">
                      {f.name} ↗
                    </a>
                    {uploaded ? (
                      <span className="pill !py-0 !text-[10px]" style={{ borderColor: "var(--color-positive)", color: "var(--color-positive)" }}>
                        Uploaded
                      </span>
                    ) : (
                      <span className="pill !py-0 !text-[10px]">Linked</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-secondary">{f.url.replace(/^https?:\/\//, "")}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-secondary btn-sm !py-1"
                    disabled={busy || Boolean(runningUrl)}
                    onClick={() => void upload(f)}
                  >
                    {isRunning ? "Reading…" : uploaded ? "Re-upload" : "Upload to brief"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm !py-1"
                    disabled={busy || Boolean(runningUrl) || saving}
                    onClick={() => void unlink(f.url)}
                  >
                    Unlink
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {frames.length === 0 && !adding && (
        <p className="mt-3 text-[13px] text-secondary">
          Link one or more frames here — same idea as the Confluence PRD. Upload pulls each frame onto the brief under Design.
        </p>
      )}

      {(runningUrl || status) && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-secondary">
          {runningUrl && (
            <span className="dot animate-pulse-soft" style={{ background: "var(--color-brand-accent)", width: 6, height: 6 }} />
          )}
          <span className={runningUrl ? "animate-pulse-soft" : undefined}>{status}</span>
        </p>
      )}
    </div>
  );
}
