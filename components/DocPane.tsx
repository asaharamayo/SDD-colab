"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { colorForLogin, docRoom, wsBaseUrl } from "@/lib/collab";
import { countClarifications } from "@/lib/speckit";
import type { DocRef, FileChange } from "@/lib/types";
import { Markdown } from "./Markdown";
import type { Presence } from "./useSharedChat";

export interface OpenDocHandle {
  doc: DocRef;
  content: () => string;
  dirty: () => boolean;
  replace: (content: string) => void;
  commit: () => Promise<void>;
}

function Diff({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l));
  return (
    <div className="diff">
      {lines.map((l, i) => (
        <span key={i} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : undefined}>
          {l || " "}
          {"\n"}
        </span>
      ))}
    </div>
  );
}

export function DocPane({
  slug,
  doc,
  title,
  subtitle,
  currentUser,
  changesVersion,
  onChanged,
  register,
  onAskAgent,
  agentEnabled,
  remoteUrl,
  stale,
  renderTop,
}: {
  renderTop?: (text: string, ready: boolean) => React.ReactNode;
  slug: string;
  doc: DocRef;
  title: string;
  subtitle?: string;
  currentUser: { login: string; name: string };
  changesVersion: number;
  onChanged: () => void;
  register: (h: OpenDocHandle | null) => void;
  onAskAgent?: (step: "clarify") => void;
  agentEnabled: boolean;
  remoteUrl?: string | null;
  /** The brief was re-committed after this doc was last written — it may be out of date. */
  stale?: boolean;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [change, setChange] = useState<FileChange | null>(null);
  // Set once the user hits Apply, so the banner can't reappear for this same
  // file until a genuinely new proposal arrives (a different diff).
  const [appliedDiff, setAppliedDiff] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<{ sha: string; pushed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef<string | null>(null);
  const saveRef = useRef<(quiet?: boolean) => Promise<void>>(async () => undefined);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  const room = docRoom(slug, doc);
  const qs = useMemo(() => `scope=${doc.scope}&path=${encodeURIComponent(doc.path)}`, [doc.scope, doc.path]);

  const loadBaseline = useCallback(async () => {
    const res = await fetch(`/api/initiatives/${slug}/files?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load");
    setBaseline(data.committed ? data.content : null);
    return data as { content: string; committed: boolean };
  }, [slug, qs]);

  // Live doc: Yjs over the host's relay, seeded from git once per room.
  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    const meta = ydoc.getMap("meta");
    const provider = new WebsocketProvider(wsBaseUrl(), room, ydoc);
    ydocRef.current = ydoc;
    providerRef.current = provider;

    provider.awareness.setLocalStateField("user", {
      name: currentUser.name,
      login: currentUser.login,
      color: colorForLogin(currentUser.login),
    });
    const onAwareness = () =>
      setPresence(
        Array.from(provider.awareness.getStates().entries())
          .filter(([, s]) => s?.user)
          .map(([clientId, s]) => ({
            clientId,
            name: s.user.name,
            color: s.user.color,
            self: clientId === provider.awareness.clientID,
          })),
      );
    provider.awareness.on("change", onAwareness);
    provider.on("status", ({ status: s }: { status: string }) => setConnected(s === "connected"));
    const onText = () => setText(ytext.toString());
    ytext.observe(onText);

    provider.once("sync", async () => {
      try {
        const data = await loadBaseline();
        if (ytext.length === 0 && !meta.get("seeded")) {
          ydoc.transact(() => {
            ytext.insert(0, data.content);
            meta.set("seeded", true);
          });
        }
      } catch (err) {
        setError((err as Error).message);
      }
      setText(ytext.toString());
      setSynced(true);
    });

    register({
      doc,
      content: () => ytext.toString(),
      dirty: () => ytext.toString() !== (baselineRef.current ?? ""),
      replace: (content: string) => {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content.endsWith("\n") ? content : content + "\n");
        });
      },
      // Imports commit immediately — don't rely on an agent run to pick up the dirty doc later.
      commit: () => saveRef.current(true),
    });

    return () => {
      register(null);
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
      provider.awareness.off("change", onAwareness);
      ytext.unobserve(onText);
      provider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // CodeMirror only while editing; the Yjs doc outlives it.
  useEffect(() => {
    const ydoc = ydocRef.current;
    const provider = providerRef.current;
    if (!editing || !synced || !ydoc || !provider || !editorRef.current) return;
    const ytext = ydoc.getText("content");
    const undoManager = new Y.UndoManager(ytext);
    const view = new EditorView({
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          markdown(),
          EditorView.lineWrapping,
          EditorView.theme({ ".cm-content": { padding: "4px 0 40vh" } }),
          keymap.of(yUndoManagerKeymap),
          yCollab(ytext, provider.awareness, { undoManager }),
        ],
      }),
      parent: editorRef.current,
    });
    view.focus();
    return () => view.destroy();
  }, [editing, synced]);

  // Pending (uncommitted) changes on disk — usually the agent's proposal.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/initiatives/${slug}/changes`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const mine = (data.changes as FileChange[]).find((c) => c.scope === doc.scope && c.path === doc.path);
        setChange(mine ?? null);
        await loadBaseline();
      } catch {
        // polling is best-effort
      }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [slug, doc.scope, doc.path, changesVersion, loadBaseline]);

  const save = useCallback(
    async (quiet = false) => {
      const ytext = ydocRef.current?.getText("content");
      if (!ytext) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/initiatives/${slug}/files?${qs}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: ytext.toString() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        if (!data.committed) {
          setStatus("Nothing new to commit");
          setLastCommit(null);
        } else {
          setStatus(
            data.pushed ? "Committed and pushed to GitHub" : data.pushError ? "Committed locally — push to GitHub failed" : "Committed locally — not yet pushed",
          );
          setLastCommit({ sha: data.sha, pushed: Boolean(data.pushed) });
        }
        if (data.pushError) setError(`Committed locally, push failed: ${data.pushError}`);
        await loadBaseline();
        if (!quiet) setEditing(false);
        onChanged();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [slug, qs, loadBaseline, onChanged],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function toggleTask(offset: number, checked: boolean) {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const ytext = ydoc.getText("content");
    ydoc.transact(() => {
      ytext.delete(offset + 1, 1);
      ytext.insert(offset + 1, checked ? "x" : " ");
    });
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => void save(true), 1500);
  }

  function applyProposal() {
    const ydoc = ydocRef.current;
    if (!ydoc || change?.workingContent == null) return;
    const ytext = ydoc.getText("content");
    const next = change.workingContent;
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, next);
    });
    setAppliedDiff(change.diff);
    setShowDiff(false);
  }

  async function discardProposal() {
    await fetch(`/api/initiatives/${slug}/changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard", scope: doc.scope, path: doc.path }),
    });
    setShowDiff(false);
    onChanged();
  }

  const dirty = synced && text !== (baseline ?? "");
  const proposal =
    change && change.workingContent !== null && change.workingContent !== text && change.diff !== appliedDiff ? change : null;
  const openQuestions = countClarifications(text);
  const others = presence.filter((p) => !p.self);

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 -mx-2 flex items-center justify-between gap-4 bg-white/95 px-2 py-4 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="heading-3 truncate">{title}</h2>
            <span className="flex items-center gap-1.5 text-xs text-secondary" title={connected ? "Live" : "Connecting"}>
              <span className="dot" style={{ background: connected ? "var(--color-positive)" : "var(--color-field)" }} />
              {connected ? "live" : "connecting"}
            </span>
          </div>
          {subtitle && <p className="mt-0.5 truncate font-mono text-xs text-secondary">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {others.length > 0 && (
            <div className="mr-1 flex -space-x-1.5">
              {others.map((p) => (
                <span
                  key={p.clientId}
                  title={`${p.name} is here`}
                  style={{ backgroundColor: p.color }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white"
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {dirty && !saving && <span className="text-xs text-secondary">Unsaved</span>}
          {editing ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Preview
            </button>
          ) : (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)} disabled={!synced}>
              Edit
            </button>
          )}
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || !synced || !dirty}
            title="Commits this document to the specs repo — GitHub is the source of truth"
          >
            {saving ? "Committing…" : "Commit"}
          </button>
        </div>
      </div>

      {proposal && (
        <div
          className="sticky z-20 mb-5 animate-pulse-soft-once rounded-[var(--radius-standard)] border-l-4 p-4 shadow-[var(--shadow-medium)]"
          style={{ top: "calc(3.5rem + 63px)", borderColor: "var(--color-brand-accent)", background: "var(--color-form-accent-soft)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="dot shrink-0" style={{ background: "var(--color-brand-accent)", width: 8, height: 8 }} />
              <span>
                <span className="font-semibold">The agent proposed {proposal.kind === "added" ? "this document" : "changes"}.</span>{" "}
                <span className="text-secondary">
                  Apply to bring them into the live doc{dirty ? " (replaces unsaved edits)" : ""}, then Commit to push to GitHub.
                </span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? "Hide diff" : "Review diff"}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => void discardProposal()}>
                Discard
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={applyProposal}>
                Apply
              </button>
            </div>
          </div>
          {showDiff && (
            <div className="mt-3 max-h-[50vh] overflow-auto rounded-md border hairline bg-white p-3">
              <Diff text={proposal.diff} />
            </div>
          )}
        </div>
      )}

      {stale && !proposal && (
        <p className="mb-5 flex items-center gap-2 rounded-[var(--radius-standard)] px-4 py-3 text-sm" style={{ background: "var(--color-caution-soft)", color: "var(--color-caution-fg)" }}>
          <span className="dot shrink-0" style={{ background: "var(--color-caution-bg)", width: 6, height: 6 }} />
          The brief changed after this was written — it may be out of date.
        </p>
      )}

      {renderTop?.(text, synced)}

      {openQuestions > 0 && !editing && !renderTop && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-[var(--radius-standard)] px-4 py-3 text-sm" style={{ background: "var(--color-caution-soft)", color: "var(--color-caution-fg)" }}>
          <span>
            {openQuestions} open question{openQuestions > 1 ? "s" : ""} marked <code>[NEEDS CLARIFICATION]</code>
          </span>
          {onAskAgent && agentEnabled && (
            <button type="button" className="btn-ghost btn-sm" style={{ color: "var(--color-caution-fg)" }} onClick={() => onAskAgent("clarify")}>
              Resolve with the agent →
            </button>
          )}
        </div>
      )}

      {status && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-secondary">
          <span className="dot" style={{ background: lastCommit ? "var(--color-positive)" : "var(--color-border-strong)", width: 6, height: 6 }} />
          {status}
          {lastCommit?.pushed && remoteUrl && (
            <>
              {" · "}
              <a className="link" href={`${remoteUrl}/commit/${lastCommit.sha}`} target="_blank" rel="noreferrer">
                View {lastCommit.sha} on GitHub
              </a>
            </>
          )}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-[var(--radius-standard)] px-3 py-2 text-sm" style={{ background: "var(--color-critical-soft)", color: "var(--color-critical)" }}>
          {error}
        </p>
      )}

      {editing ? (
        <div ref={editorRef} className="collab-editor" />
      ) : !synced ? (
        <p className="py-10 text-sm text-secondary">Loading…</p>
      ) : text.trim() ? (
        <div onDoubleClick={() => setEditing(true)} className="pb-[30vh]">
          <Markdown source={text} onToggleTask={toggleTask} />
        </div>
      ) : (
        <p className="py-10 text-sm text-secondary">Empty document. Click Edit to start writing.</p>
      )}
    </div>
  );
}
