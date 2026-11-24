import { Agent, CursorAgentError, type Run, type SDKAgent } from "@cursor/sdk";
import { repoDir } from "./repo";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; label: string; status: "running" | "completed" | "error" }
  | { type: "done"; status: string; error?: string };

interface Session {
  agent?: SDKAgent;
  run?: Run;
  primed: boolean;
  busy?: { by: string; step?: string; since: number };
}

const g = globalThis as unknown as { __uswAgents?: Map<string, Session> };
const sessions = (g.__uswAgents ??= new Map());

export function agentConfigured() {
  return Boolean(process.env.CURSOR_API_KEY);
}

export function agentModel() {
  return process.env.CURSOR_MODEL || "composer-2.5";
}

function sessionFor(slug: string): Session {
  let s = sessions.get(slug);
  if (!s) {
    s = { primed: false };
    sessions.set(slug, s);
  }
  return s;
}

export function agentBusy(slug: string) {
  return sessions.get(slug)?.busy ?? null;
}

export function isPrimed(slug: string) {
  return sessions.get(slug)?.primed ?? false;
}

function toolLabel(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const target = [a.path, a.file_path, a.target_file, a.filePath, a.pattern, a.query]
    .find((v): v is string => typeof v === "string");
  const short = target ? target.split("/").slice(-2).join("/") : "";
  const verb: Record<string, string> = {
    read: "Reading",
    write: "Writing",
    edit: "Editing",
    str_replace: "Editing",
    glob: "Looking for",
    grep: "Searching",
    ls: "Listing",
    shell: "Running",
    delete: "Deleting",
  };
  const key = name.toLowerCase().replace(/tool$/, "");
  const v = verb[key] ?? name;
  return short ? `${v} ${short}` : v;
}

export async function runAgent(
  slug: string,
  prompt: string,
  meta: { by: string; step?: string },
  emit: (e: AgentEvent) => void,
): Promise<void> {
  const s = sessionFor(slug);
  if (s.busy) throw new Error(`The agent is already working for ${s.busy.by}.`);
  s.busy = { by: meta.by, step: meta.step, since: Date.now() };
  try {
    s.agent ??= await Agent.create({
      apiKey: process.env.CURSOR_API_KEY!,
      model: { id: agentModel() },
      local: { cwd: repoDir(), settingSources: ["project"] },
    });
    const run = await s.agent.send(prompt, {
      onDelta: ({ update }) => {
        if (update.type === "text-delta") emit({ type: "text", text: update.text });
      },
    });
    s.run = run;
    s.primed = true;
    for await (const msg of run.stream()) {
      if (msg.type === "tool_call") {
        emit({ type: "tool", id: msg.call_id, label: toolLabel(msg.name, msg.args), status: msg.status });
      }
    }
    const result = await run.wait();
    emit({ type: "done", status: result.status, error: result.error?.message });
  } catch (err) {
    const message =
      err instanceof CursorAgentError
        ? `${err.message}${err.isRetryable ? " (retryable — try again)" : ""}`
        : err instanceof Error
          ? err.message
          : "Agent failed to start";
    if (s.agent && !s.run) {
      await s.agent[Symbol.asyncDispose]().catch(() => undefined);
      s.agent = undefined;
      s.primed = false;
    }
    emit({ type: "done", status: "error", error: message });
  } finally {
    s.run = undefined;
    s.busy = undefined;
  }
}

export async function cancelAgent(slug: string) {
  const run = sessions.get(slug)?.run;
  if (run?.supports("cancel")) await run.cancel();
}

export async function resetAgent(slug: string) {
  const s = sessions.get(slug);
  if (!s) return;
  await cancelAgent(slug).catch(() => undefined);
  await s.agent?.[Symbol.asyncDispose]().catch(() => undefined);
  sessions.delete(slug);
}
