"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { chatRoom, colorForLogin, wsBaseUrl } from "@/lib/collab";
import { LENSES, parseCommand, parseTaggedQuestions, STEP_BY_ID, type LensId, type TaggedQuestion } from "@/lib/speckit";
import type { DocRef, StepId } from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "note" | "notice";
  author: string;
  color: string;
  text: string;
  ts: number;
  command?: string;
  status?: "streaming" | "done" | "error" | "cancelled";
  activity?: string[];
  /** For a "notice": the role it's addressed to, and who it's meant for. */
  toRole?: LensId;
  toLogin?: string;
  title?: string;
}

export interface AgentBusy {
  by: string;
  step?: string;
  clientId: number;
  since: number;
}

export interface Presence {
  clientId: number;
  name: string;
  login?: string;
  color: string;
  self: boolean;
  /** Role this person tagged themselves as for this session — who Clarify's Slack pings target. */
  role?: LensId | null;
}

const STALE_MS = 20 * 60 * 1000;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useSharedChat(opts: {
  slug: string;
  user: { login: string; name: string };
  role: LensId | null;
  agentEnabled: boolean;
  getOpenDoc: () => (DocRef & { content: string }) | null;
}) {
  const { slug, user, role, agentEnabled } = opts;
  const getOpenDocRef = useRef(opts.getOpenDoc);
  useEffect(() => {
    getOpenDocRef.current = opts.getOpenDoc;
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawBusy, setRawBusy] = useState<AgentBusy | null>(null);
  const [changesVersion, setChangesVersion] = useState(0);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [ready, setReady] = useState(false);
  const presenceRef = useRef<Presence[]>([]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsBaseUrl(), chatRoom(slug), ydoc);
    docRef.current = ydoc;
    providerRef.current = provider;
    const arr = ydoc.getArray<Y.Map<unknown>>("messages");
    const state = ydoc.getMap<unknown>("state");

    provider.awareness.setLocalStateField("user", {
      name: user.name,
      login: user.login,
      color: colorForLogin(user.login),
      role,
    });
    const syncMessages = () => setMessages(arr.toArray().map((m) => m.toJSON() as ChatMessage));
    const syncState = () => {
      setRawBusy((state.get("busy") as AgentBusy | null) ?? null);
      setChangesVersion((state.get("changesVersion") as number) ?? 0);
    };
    const syncPresence = () => {
      const next = Array.from(provider.awareness.getStates().entries())
        .filter(([, s]) => s?.user)
        .map(([clientId, s]) => ({
          clientId,
          name: s.user.name,
          login: s.user.login,
          color: s.user.color,
          role: s.user.role ?? null,
          self: clientId === provider.awareness.clientID,
        }));
      presenceRef.current = next;
      setPresence(next);
    };
    arr.observeDeep(syncMessages);
    state.observe(syncState);
    provider.awareness.on("change", syncPresence);
    provider.once("sync", () => setReady(true));
    syncMessages();
    syncState();
    syncPresence();

    return () => {
      provider.awareness.off("change", syncPresence);
      provider.destroy();
      ydoc.destroy();
      docRef.current = null;
      providerRef.current = null;
      setReady(false);
    };
    // role is intentionally excluded: it's synced by the effect below without
    // tearing down and reconnecting the whole room on every role change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user.login, user.name]);

  // Role can change after connecting (the picker), without tearing down the room.
  useEffect(() => {
    providerRef.current?.awareness.setLocalStateField("user", {
      name: user.name,
      login: user.login,
      color: colorForLogin(user.login),
      role,
    });
  }, [role, user.login, user.name]);

  // A run whose initiator closed the tab would otherwise lock the chat forever.
  const busy =
    rawBusy &&
    presence.some((p) => p.clientId === rawBusy.clientId) &&
    Date.now() - rawBusy.since < STALE_MS
      ? rawBusy
      : null;

  const push = useCallback((m: Omit<ChatMessage, "id" | "ts">) => {
    const ydoc = docRef.current;
    if (!ydoc) return null;
    const ymap = new Y.Map<unknown>();
    const id = uid();
    ydoc.transact(() => {
      for (const [k, v] of Object.entries({ ...m, id, ts: Date.now() })) {
        if (v !== undefined) ymap.set(k, v);
      }
      ydoc.getArray<Y.Map<unknown>>("messages").push([ymap]);
    });
    return ymap;
  }, []);

  const bumpChanges = useCallback(() => {
    const state = docRef.current?.getMap<unknown>("state");
    if (state) state.set("changesVersion", ((state.get("changesVersion") as number) ?? 0) + 1);
  }, []);

  const send = useCallback(
    async (input: { step?: StepId; text: string; lens?: LensId; label?: string }) => {
      const ydoc = docRef.current;
      const provider = providerRef.current;
      if (!ydoc || !provider) return;
      const parsed = input.step ? { step: input.step, args: input.text.trim() } : parseCommand(input.text);
      const def = parsed.step ? STEP_BY_ID[parsed.step] : undefined;
      const lensNote = input.lens ? ` · ${LENSES[input.lens].label} view` : "";
      const display = def
        ? `${def.command}${lensNote}${input.label ? ` ${input.label}` : parsed.args ? ` ${parsed.args}` : ""}`
        : parsed.args;
      if (!display) return;

      const color = colorForLogin(user.login);
      push({ role: "user", author: user.name, color, text: display, command: def?.command });

      if (!agentEnabled) {
        if (def) push({ role: "note", author: "", color: "", text: "No Cursor agent on this host — set CURSOR_API_KEY to enable steps." });
        return;
      }
      if (def?.scope === "handoff") {
        push({ role: "note", author: "", color: "", text: "Implement runs in the product repo — open the Implement step for the hand-off." });
        return;
      }

      const state = ydoc.getMap<unknown>("state");
      state.set("busy", {
        by: user.name,
        step: def ? `${def.label}${lensNote}` : undefined,
        clientId: provider.awareness.clientID,
        since: Date.now(),
      } satisfies AgentBusy);

      const reply = push({
        role: "agent",
        author: "Cursor agent",
        color: "",
        text: "",
        status: "streaming",
        activity: [],
      })!;

      let buffer = "";
      let activity: string[] = [];
      const flush = () => {
        if (!buffer) return;
        reply.set("text", ((reply.get("text") as string) ?? "") + buffer);
        buffer = "";
      };
      const timer = setInterval(flush, 120);

      try {
        const open = getOpenDocRef.current();
        const res = await fetch(`/api/initiatives/${slug}/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: parsed.args,
            lens: input.lens,
            step: parsed.step && parsed.step !== "implement" ? parsed.step : undefined,
            openDoc: open ?? undefined,
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Agent request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let final: { status: string; error?: string } | null = null;
        let changed: string[] = [];
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "text") buffer += e.text;
            else if (e.type === "tool" && e.status === "running") {
              activity = [...activity, e.label].slice(-12);
              reply.set("activity", activity);
            } else if (e.type === "done") final = e;
            else if (e.type === "changes") changed = e.files;
          }
        }
        flush();
        const status = final?.status === "finished" ? "done" : final?.status === "cancelled" ? "cancelled" : "error";
        if (final?.error) reply.set("text", `${reply.get("text") ?? ""}\n\n> ${final.error}`);
        reply.set("status", status);
        if (changed.length) {
          push({
            role: "note",
            author: "",
            color: "",
            text: `Proposed changes to ${changed.join(", ")} — review and apply them in the document.`,
          });
        }
        if (status === "done" && parsed.step === "clarify") {
          const tagged = parseTaggedQuestions((reply.get("text") as string) ?? "");
          for (const [role, questions] of Object.entries(tagged) as [LensId, TaggedQuestion[]][]) {
            const person = presenceRef.current.find((p) => p.role === role) ?? null;
            const label = LENSES[role].label;
            const res = await fetch(`/api/initiatives/${slug}/notify-slack`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role,
                questions: questions.map((q) => q.text),
                person: person ? { name: person.name, login: person.login } : null,
              }),
            })
              .then((r) => r.json())
              .catch((err) => ({ ok: false, error: (err as Error).message }));
            push({
              role: "note",
              author: "",
              color: "",
              text: res.ok
                ? `🔔 Notified ${person ? person.name : label} on Slack — ${questions.length} ${label} question${questions.length > 1 ? "s" : ""}.`
                : person
                  ? `Would notify ${person.name} (${label}) on Slack — ${res.error ?? "Slack isn't connected on this host."}`
                  : `${questions.length} ${label} question${questions.length > 1 ? "s" : ""} raised — no one tagged ${label} is here to notify.`,
            });
          }
        } else if (status === "done" && parsed.step === "tasks") {
          // Analyze is read-only and cheap — run it right away so a fresh
          // consistency check always sits under a newly generated task list,
          // instead of being one more thing someone has to remember to click.
          void send({ step: "analyze", text: "" });
        } else if (status === "done" && parsed.step === "analyze") {
          push({
            role: "notice",
            author: "",
            color: "",
            title: "Analyze finished",
            text: "The consistency check is on the Tasks page — view any gaps it flagged, then confirm the tasks as reviewed.",
            toLogin: user.login,
          });
        }
      } catch (err) {
        flush();
        reply.set("text", `${reply.get("text") ?? ""}\n\n> ${(err as Error).message}`);
        reply.set("status", "error");
      } finally {
        clearInterval(timer);
        state.set("busy", null);
        bumpChanges();
      }
    },
    [slug, user.login, user.name, agentEnabled, push, bumpChanges],
  );

  const cancel = useCallback(async () => {
    await fetch(`/api/initiatives/${slug}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }, [slug]);

  /**
   * Demo / walkthrough only — looks like a real agent run (busy bar + streaming reply)
   * without hitting Cursor. Used for the Figma-frame mock on Spec.
   */
  const simulate = useCallback(
    async (input: {
      userText: string;
      command?: string;
      stepLabel: string;
      run: (ctx: {
        setActivity: (label: string) => void;
        append: (text: string) => void;
      }) => Promise<void>;
    }) => {
      const ydoc = docRef.current;
      const provider = providerRef.current;
      if (!ydoc || !provider) return;
      const state = ydoc.getMap<unknown>("state");
      // A leftover lock from a closed tab looks idle in the UI but blocks this path.
      const raw = state.get("busy") as AgentBusy | null;
      const live =
        raw &&
        presenceRef.current.some((p) => p.clientId === raw.clientId) &&
        Date.now() - raw.since < STALE_MS;
      if (live) return;
      if (raw) state.set("busy", null);

      const color = colorForLogin(user.login);
      push({ role: "user", author: user.name, color, text: input.userText, command: input.command });
      state.set("busy", {
        by: user.name,
        step: input.stepLabel,
        clientId: provider.awareness.clientID,
        since: Date.now(),
      } satisfies AgentBusy);

      const reply = push({
        role: "agent",
        author: "Cursor agent",
        color: "",
        text: "",
        status: "streaming",
        activity: [],
      });
      if (!reply) {
        state.set("busy", null);
        return;
      }

      try {
        await input.run({
          setActivity: (label) => {
            const prev = (reply.get("activity") as string[] | undefined) ?? [];
            reply.set("activity", [...prev, label].slice(-12));
          },
          append: (text) => {
            reply.set("text", ((reply.get("text") as string) ?? "") + text);
          },
        });
        reply.set("status", "done");
      } catch (err) {
        reply.set("text", `${(reply.get("text") as string) ?? ""}\n\n> ${(err as Error).message}`);
        reply.set("status", "error");
      } finally {
        state.set("busy", null);
      }
    },
    [push, user.login, user.name],
  );

  return { ready, messages, busy, changesVersion, bumpChanges, presence, send, cancel, simulate };
}
