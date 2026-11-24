import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import {
  CONSTITUTION_PATH,
  briefTemplate,
  currentStage,
  stageViews,
  stepViews,
  type FeatureSnapshot,
} from "./speckit";
import type {
  DocRef,
  FileChange,
  InitiativeMeta,
  InitiativeSummary,
} from "./types";

const exec = promisify(execFile);

const REPO_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.SPECS_REPO_DIR || path.join(process.cwd(), ".data", "specs-repo"),
);
const SPECS = "specs";
const META_FILE = "initiative.yaml";
const SAFE_PATH = /^[A-Za-z0-9._\-/]+\.md$/;

export interface Author {
  login: string;
  name: string;
}

export function repoDir() {
  return REPO_DIR;
}

async function git(args: string[], opts: { env?: Record<string, string>; timeout?: number } = {}) {
  const { stdout } = await exec("git", args, {
    cwd: REPO_DIR,
    maxBuffer: 20 * 1024 * 1024,
    timeout: opts.timeout ?? 20_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...opts.env },
  });
  return stdout;
}

async function tryGit(args: string[]) {
  try {
    return await git(args);
  } catch {
    return null;
  }
}

// Serialise every git mutation: concurrent saves from many people share one index.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.catch(() => undefined);
  return next;
}

const committerEnv: Record<string, string> = {};

let ready: Promise<void> | null = null;
export function ensureRepo(): Promise<void> {
  ready ??= (async () => {
    const exists = await fs.stat(path.join(REPO_DIR, ".git")).then(() => true, () => false);
    if (!exists) {
      if (process.env.SPECS_REPO_URL) {
        await fs.mkdir(path.dirname(REPO_DIR), { recursive: true });
        await exec("git", ["clone", process.env.SPECS_REPO_URL, REPO_DIR], {
          timeout: 120_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
      } else {
        await fs.mkdir(REPO_DIR, { recursive: true });
        await git(["init", "-b", process.env.SPECS_BRANCH || "main"]);
      }
    }
    if (!(await tryGit(["config", "user.email"]))?.trim()) {
      committerEnv.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME || "SDD Colab";
      committerEnv.GIT_COMMITTER_EMAIL = process.env.GIT_COMMITTER_EMAIL || "workspace@localhost";
    }
    if (!(await tryGit(["rev-parse", "--verify", "HEAD"]))) {
      await fs.mkdir(path.join(REPO_DIR, SPECS), { recursive: true });
      await fs.writeFile(
        path.join(REPO_DIR, "README.md"),
        "# Specs\n\nSpec Kit features live in `specs/NNN-feature/`. Edited through SDD Colab.\n",
      );
      await fs.writeFile(path.join(REPO_DIR, SPECS, ".gitkeep"), "");
      await git(["add", "README.md", `${SPECS}/.gitkeep`]);
      await git(
        ["commit", "-m", "chore: initialise specs repo", "--author", "SDD Colab <workspace@localhost>"],
        { env: committerEnv },
      );
    }
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/* ---------- paths ---------- */

export function featureDir(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Invalid feature id");
  return `${SPECS}/${slug}`;
}

/** Repo-relative path for a doc, validated to stay inside its scope. */
export function resolveDoc(slug: string, doc: DocRef): string {
  if (doc.scope === "repo") {
    if (doc.path !== CONSTITUTION_PATH) throw new Error("Only the constitution is editable at repo scope");
    return CONSTITUTION_PATH;
  }
  if (!SAFE_PATH.test(doc.path) || doc.path.split("/").some((seg) => seg === ".." || seg === "")) {
    throw new Error("Invalid path");
  }
  return `${featureDir(slug)}/${doc.path}`;
}

/* ---------- reads ---------- */

async function readWorking(rel: string): Promise<string | null> {
  return fs.readFile(path.join(REPO_DIR, rel), "utf8").catch(() => null);
}

async function readHead(rel: string): Promise<string | null> {
  return tryGit(["show", `HEAD:${rel}`]);
}

export async function readDoc(slug: string, doc: DocRef, ref: "head" | "working" = "head") {
  await ensureRepo();
  const rel = resolveDoc(slug, doc);
  const head = await readHead(rel);
  const working = ref === "working" || head === null ? await readWorking(rel) : null;
  return { content: head ?? working ?? "", committed: head !== null, exists: head !== null || working !== null };
}

async function listMarkdown(absDir: string, base = ""): Promise<string[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listMarkdown(path.join(absDir, e.name), rel)));
    else if (e.name.endsWith(".md")) out.push(rel);
  }
  return out.sort();
}

function humanise(slug: string) {
  const words = slug.replace(/^\d+-/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function readMetaYaml(slug: string): Promise<Record<string, unknown>> {
  const raw = await readWorking(`${featureDir(slug)}/${META_FILE}`);
  return (raw ? (yamlLoad(raw) as Record<string, unknown>) : {}) ?? {};
}

function parseReviewed(v: unknown): InitiativeMeta["tasksReviewed"] {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  return typeof r.login === "string" && typeof r.at === "string"
    ? { login: r.login, name: typeof r.name === "string" ? r.name : r.login, at: r.at }
    : undefined;
}

function parseJiraKeys(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
  return Object.keys(out).length ? out : undefined;
}

function parseFigmaFrames(v: unknown): InitiativeMeta["figmaFrames"] {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<InitiativeMeta["figmaFrames"]> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.url !== "string" || typeof f.name !== "string") continue;
    out.push({
      url: f.url,
      name: f.name,
      uploadedAt: typeof f.uploadedAt === "string" ? f.uploadedAt : undefined,
    });
  }
  return out.length ? out : undefined;
}

async function readMeta(slug: string): Promise<InitiativeMeta> {
  const dir = featureDir(slug);
  const y = await readMetaYaml(slug);
  let title = typeof y.title === "string" ? y.title : "";
  if (!title) {
    const spec = await readWorking(`${dir}/spec.md`);
    title = spec?.match(/^#\s+Feature Specification:\s*(.+)$/m)?.[1]?.trim() || humanise(slug);
  }
  return {
    slug,
    number: slug.match(/^(\d+)/)?.[1] ?? "",
    title,
    problem: typeof y.problem === "string" ? y.problem : "",
    value: typeof y.value === "string" ? y.value : "",
    confluenceUrl: typeof y.confluenceUrl === "string" ? y.confluenceUrl : undefined,
    figmaFrames: parseFigmaFrames(y.figmaFrames),
    owner: typeof y.owner === "string" ? y.owner : "",
    createdAt: typeof y.createdAt === "string" ? y.createdAt : "",
    tasksReviewed: parseReviewed(y.tasksReviewed),
    jiraKeys: parseJiraKeys(y.jiraKeys),
  };
}

export async function hasConstitution() {
  await ensureRepo();
  return (await readWorking(CONSTITUTION_PATH)) !== null;
}

export async function snapshot(slug: string): Promise<FeatureSnapshot> {
  const dir = featureDir(slug);
  const files = await listMarkdown(path.join(REPO_DIR, dir));
  return {
    files,
    brief: (await readWorking(`${dir}/brief.md`)) ?? undefined,
    spec: (await readWorking(`${dir}/spec.md`)) ?? undefined,
    tasks: (await readWorking(`${dir}/tasks.md`)) ?? undefined,
    analyze: (await readWorking(`${dir}/analyze.md`)) ?? undefined,
    hasConstitution: await hasConstitution(),
    tasksReviewed: await reviewIsCurrent(slug),
  };
}

/** A sign-off only holds until tasks.md or analyze.md is committed again. */
async function reviewIsCurrent(slug: string): Promise<boolean> {
  const reviewed = parseReviewed((await readMetaYaml(slug)).tasksReviewed);
  if (!reviewed) return false;
  const at = Math.floor(Date.parse(reviewed.at) / 1000);
  if (!Number.isFinite(at)) return false;
  const dir = featureDir(slug);
  const [tasksAt, analyzeAt] = await Promise.all([lastTouched(`${dir}/tasks.md`), lastTouched(`${dir}/analyze.md`)]);
  return (tasksAt == null || at >= tasksAt) && (analyzeAt == null || at >= analyzeAt);
}

export async function listInitiatives(): Promise<InitiativeSummary[]> {
  await ensureRepo();
  const entries = await fs
    .readdir(path.join(REPO_DIR, SPECS), { withFileTypes: true })
    .catch(() => []);
  const slugs = entries
    .filter((e) => e.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  return Promise.all(
    slugs.map(async (slug) => {
      const [meta, snap] = await Promise.all([readMeta(slug), snapshot(slug)]);
      const cur = currentStage(stageViews(snap, stepViews(snap)));
      return {
        ...meta,
        files: snap.files,
        stage: cur ? { n: cur.n, label: cur.label } : null,
      };
    }),
  );
}

/** Unix seconds of the last commit that touched this path, or null if never committed. */
async function lastTouched(rel: string): Promise<number | null> {
  const out = await tryGit(["log", "-1", "--format=%ct", "--", rel]);
  const n = out ? parseInt(out.trim(), 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Has the brief changed (been re-committed) since spec/plan/tasks were last
 * committed? Compares git history, not live edits — an uncommitted draft
 * isn't "official" yet, so it can't make a downstream doc stale.
 */
export async function staleness(
  slug: string,
): Promise<Partial<Record<"spec" | "plan" | "tasks" | "analyze", boolean>>> {
  await ensureRepo();
  const dir = featureDir(slug);
  const [briefAt, specAt, planAt, tasksAt, analyzeAt] = await Promise.all(
    ["brief", "spec", "plan", "tasks", "analyze"].map((f) => lastTouched(`${dir}/${f}.md`)),
  );
  const out: Partial<Record<"spec" | "plan" | "tasks" | "analyze", boolean>> = {};
  if (briefAt != null) {
    if (specAt != null) out.spec = briefAt > specAt;
    if (planAt != null) out.plan = briefAt > planAt;
    if (tasksAt != null) out.tasks = briefAt > tasksAt;
  }
  if (analyzeAt != null) {
    // Compare against what the analysis actually read — Analyze often runs while
    // tasks.md is still an unapplied proposal, so commit order alone would lie.
    const read = (await readMetaYaml(slug)).analyzedInputs;
    if (read && typeof read === "object") {
      const now = await inputHashes(slug);
      const r = read as Record<string, unknown>;
      out.analyze = (["spec", "plan", "tasks"] as const).some((k) => r[k] !== now[k]);
    } else {
      out.analyze = Math.max(specAt ?? 0, planAt ?? 0, tasksAt ?? 0) > analyzeAt;
    }
  }
  return out;
}

async function inputHashes(slug: string): Promise<Record<"spec" | "plan" | "tasks", string>> {
  const dir = featureDir(slug);
  const hash = async (f: string) => {
    const txt = await readWorking(`${dir}/${f}.md`);
    return txt == null ? "" : createHash("sha1").update(txt).digest("hex").slice(0, 12);
  };
  const [spec, plan, tasks] = await Promise.all([hash("spec"), hash("plan"), hash("tasks")]);
  return { spec, plan, tasks };
}

/** analyze.md is a read-only report — commit it straight away, with a fingerprint of what it read. */
export function commitAnalysis(slug: string, author: Author, token?: string) {
  return withLock(async () => {
    await ensureRepo();
    const dir = featureDir(slug);
    const y = await readMetaYaml(slug);
    y.analyzedInputs = await inputHashes(slug);
    await fs.writeFile(path.join(REPO_DIR, dir, META_FILE), yamlDump(y, { lineWidth: 100 }));
    return commitPaths([`${dir}/analyze.md`, `${dir}/${META_FILE}`], `docs(${slug}): analyze spec/plan/tasks — @${author.login}`, author, token);
  });
}

export interface ActivityEntry {
  sha: string;
  name: string;
  login: string;
  date: string;
  message: string;
}

/** Who committed what, for this feature — real per-person git author, independent of who pushes. */
export async function listActivity(slug: string): Promise<ActivityEntry[]> {
  await ensureRepo();
  const dir = featureDir(slug);
  const SEP = "\x1f";
  const out = await tryGit([
    "log",
    `--format=%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s`,
    "--",
    dir,
    CONSTITUTION_PATH,
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, name, email, date, message] = line.split(SEP);
      const login = email?.split("@")[0] || name;
      return { sha: sha?.slice(0, 7) ?? "", name: name ?? login, login, date: date ?? "", message: message ?? "" };
    });
}

export async function getInitiative(slug: string) {
  await ensureRepo();
  const dir = featureDir(slug);
  const exists = await fs.stat(path.join(REPO_DIR, dir)).then((s) => s.isDirectory(), () => false);
  if (!exists) return null;
  const [meta, snap] = await Promise.all([readMeta(slug), snapshot(slug)]);
  return { meta, snapshot: snap };
}

export async function readRepoCommand(step: string): Promise<string | undefined> {
  await ensureRepo();
  for (const p of [`.cursor/commands/speckit.${step}.md`, `.claude/commands/speckit.${step}.md`]) {
    const txt = await readWorking(p);
    if (txt) return txt;
  }
  return undefined;
}

/* ---------- writes ---------- */

function authorArg(a: Author) {
  const name = a.name.replace(/[<>\n]/g, "") || a.login;
  return `${name} <${a.login.replace(/[^A-Za-z0-9._-]/g, "")}@users.noreply.github.com>`;
}

export async function remoteInfo() {
  await ensureRepo();
  const url = (await tryGit(["remote", "get-url", "origin"]))?.trim() || null;
  const branch = (await tryGit(["rev-parse", "--abbrev-ref", "HEAD"]))?.trim() || "main";
  let webUrl: string | null = null;
  const m = url?.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) webUrl = `https://github.com/${m[1]}/${m[2]}`;
  return { url, branch, webUrl, dir: REPO_DIR };
}

async function push(token?: string): Promise<{ pushed: boolean; pushError?: string }> {
  const { url, branch } = await remoteInfo();
  if (!url) return { pushed: false };
  const args: string[] = [];
  if (token && url.startsWith("https://github.com")) {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    args.push("-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`);
  }
  try {
    await git([...args, "push", "origin", `HEAD:${branch}`], { timeout: 45_000 });
    return { pushed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n").slice(-3).join(" ") : "push failed";
    return { pushed: false, pushError: msg };
  }
}

export interface CommitResult {
  committed: boolean;
  sha?: string;
  pushed: boolean;
  pushError?: string;
}

async function commitPaths(rels: string[], message: string, author: Author, token?: string): Promise<CommitResult> {
  await git(["add", "-A", "--", ...rels]);
  const staged = (await git(["diff", "--cached", "--name-only", "--", ...rels])).trim();
  if (!staged) return { committed: false, pushed: false };
  await git(["commit", "-m", message, "--author", authorArg(author), "--", ...rels], {
    env: committerEnv,
  });
  const sha = (await git(["rev-parse", "--short", "HEAD"])).trim();
  return { committed: true, sha, ...(await push(token)) };
}

export function saveDoc(
  slug: string,
  doc: DocRef,
  content: string,
  author: Author,
  token?: string,
): Promise<CommitResult> {
  return withLock(async () => {
    await ensureRepo();
    const rel = resolveDoc(slug, doc);
    await fs.mkdir(path.dirname(path.join(REPO_DIR, rel)), { recursive: true });
    await fs.writeFile(path.join(REPO_DIR, rel), content.endsWith("\n") ? content : content + "\n");
    const scope = doc.scope === "repo" ? "constitution" : slug;
    return commitPaths([rel], `docs(${scope}): update ${path.basename(rel)} — @${author.login}`, author, token);
  });
}

/** Link (or unlink) the Confluence page this brief mirrors. Committed, so the link itself is tracked in git. */
export function setConfluenceLink(slug: string, url: string | null, author: Author, token?: string) {
  return withLock(async () => {
    await ensureRepo();
    const dir = featureDir(slug);
    const raw = await readWorking(`${dir}/${META_FILE}`);
    const y = (raw ? (yamlLoad(raw) as Record<string, unknown>) : {}) ?? {};
    if (url) y.confluenceUrl = url;
    else delete y.confluenceUrl;
    await fs.writeFile(path.join(REPO_DIR, dir, META_FILE), yamlDump(y, { lineWidth: 100 }));
    return commitPaths(
      [`${dir}/${META_FILE}`],
      `docs(${slug}): ${url ? "link" : "unlink"} Confluence page — @${author.login}`,
      author,
      token,
    );
  });
}

function updateMeta(
  slug: string,
  mutate: (y: Record<string, unknown>) => void,
  message: string,
  author: Author,
  token?: string,
) {
  return withLock(async () => {
    await ensureRepo();
    const dir = featureDir(slug);
    const y = await readMetaYaml(slug);
    mutate(y);
    await fs.writeFile(path.join(REPO_DIR, dir, META_FILE), yamlDump(y, { lineWidth: 100 }));
    return commitPaths([`${dir}/${META_FILE}`], message, author, token);
  });
}

export function setTasksReviewed(slug: string, author: Author, token?: string) {
  return updateMeta(
    slug,
    (y) => {
      y.tasksReviewed = { login: author.login, name: author.name, at: new Date().toISOString() };
    },
    `docs(${slug}): tasks reviewed — @${author.login}`,
    author,
    token,
  );
}

export function setFigmaFrames(
  slug: string,
  frames: NonNullable<InitiativeMeta["figmaFrames"]>,
  author: Author,
  token?: string,
) {
  return updateMeta(
    slug,
    (y) => {
      if (frames.length) y.figmaFrames = frames;
      else delete y.figmaFrames;
    },
    `docs(${slug}): update linked Figma frames — @${author.login}`,
    author,
    token,
  );
}

export function addJiraKeys(slug: string, keys: Record<string, string>, author: Author, token?: string) {
  return updateMeta(
    slug,
    (y) => {
      y.jiraKeys = { ...(parseJiraKeys(y.jiraKeys) ?? {}), ...keys };
    },
    `docs(${slug}): link ${Object.keys(keys).length} Jira issue(s) — @${author.login}`,
    author,
    token,
  );
}

function kebab(s: string) {
  const stop = new Set(["a", "an", "the", "for", "to", "of", "and", "in", "on", "with", "i", "want"]);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w))
    .slice(0, 4)
    .join("-") || "feature";
}

export function createInitiative(
  input: {
    title: string;
    problem: string;
    value: string;
    hypothesis: string;
    inScope: string;
    outScope: string;
    dependencies: string;
  },
  author: Author,
  token?: string,
) {
  return withLock(async () => {
    await ensureRepo();
    const entries = await fs.readdir(path.join(REPO_DIR, SPECS)).catch(() => [] as string[]);
    const max = entries.reduce((m, e) => Math.max(m, Number(e.match(/^(\d+)-/)?.[1] ?? 0)), 0);
    const number = String(max + 1).padStart(3, "0");
    const slug = `${number}-${kebab(input.title)}`;
    const dir = featureDir(slug);
    await fs.mkdir(path.join(REPO_DIR, dir), { recursive: true });

    const meta: InitiativeMeta = {
      slug,
      number,
      title: input.title,
      problem: input.problem,
      value: input.value,
      owner: author.login,
      createdAt: new Date().toISOString(),
    };
    const { slug: _s, number: _n, ...persisted } = meta;
    void _s;
    void _n;
    await fs.writeFile(path.join(REPO_DIR, dir, META_FILE), yamlDump(persisted, { lineWidth: 100 }));
    await fs.writeFile(path.join(REPO_DIR, dir, "brief.md"), briefTemplate(input));
    const result = await commitPaths([dir], `feat(specs): start ${slug} — @${author.login}`, author, token);
    return { meta, result };
  });
}

/* ---------- uncommitted changes (agent proposals, pending saves) ---------- */

export async function listChanges(slug: string): Promise<FileChange[]> {
  await ensureRepo();
  const dir = featureDir(slug);
  const out = await git(["status", "--porcelain=v1", "-uall", "-z", "--", dir, CONSTITUTION_PATH]);
  const entries = out.split("\0").filter(Boolean);
  const changes: FileChange[] = [];
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    const rel = entries[i].slice(3);
    if (code.startsWith("R")) {
      i++;
      continue;
    }
    if (!rel.endsWith(".md")) continue;
    const kind = code === "??" || code.includes("A") ? "added" : code.includes("D") ? "deleted" : "modified";
    const working = await readWorking(rel);
    const diff =
      kind === "added"
        ? (working ?? "")
            .split("\n")
            .map((l) => `+${l}`)
            .join("\n")
        : ((await tryGit(["diff", "HEAD", "--", rel])) ?? "");
    const scope = rel === CONSTITUTION_PATH ? "repo" : "feature";
    changes.push({
      scope,
      path: scope === "repo" ? rel : rel.slice(dir.length + 1),
      kind,
      diff,
      workingContent: working,
    });
  }
  return changes;
}

export function discardChange(slug: string, doc: DocRef) {
  return withLock(async () => {
    const rel = resolveDoc(slug, doc);
    if (await readHead(rel)) {
      await git(["restore", "--source=HEAD", "--staged", "--worktree", "--", rel]);
    } else {
      await tryGit(["rm", "--cached", "-q", "--", rel]);
      await fs.rm(path.join(REPO_DIR, rel), { force: true });
    }
  });
}