/**
 * Minimal Jira Cloud client for turning tasks.md into issues. Reuses the
 * Confluence credentials when the Jira ones aren't set — one Atlassian API
 * token covers both products on the same site.
 */

interface JiraCreds {
  base: string;
  email: string;
  token: string;
  project: string;
}

function creds(): JiraCreds | null {
  const base = (process.env.JIRA_BASE_URL || process.env.CONFLUENCE_BASE_URL || "").replace(/\/wiki\/?$/, "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || process.env.CONFLUENCE_EMAIL || "";
  const token = process.env.JIRA_API_TOKEN || process.env.CONFLUENCE_API_TOKEN || "";
  const project = process.env.JIRA_PROJECT_KEY || "";
  return base && email && token && project ? { base, email, token, project } : null;
}

export function jiraInfo(): { configured: boolean; projectKey: string | null; baseUrl: string | null } {
  const c = creds();
  return { configured: Boolean(c), projectKey: c?.project ?? null, baseUrl: c?.base ?? null };
}

export interface NewIssue {
  taskId: string;
  summary: string;
  description: string;
  issueType: string;
  labels: string[];
}

export async function createIssues(
  issues: NewIssue[],
): Promise<{ created: Record<string, string>; errors: { taskId: string; error: string }[] }> {
  const c = creds();
  if (!c) throw new Error("Jira isn't connected on this host.");
  const auth = `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}`;
  const created: Record<string, string> = {};
  const errors: { taskId: string; error: string }[] = [];

  // The bulk endpoint takes at most 50 issues per call.
  for (let i = 0; i < issues.length; i += 50) {
    const chunk = issues.slice(i, i + 50);
    const res = await fetch(`${c.base}/rest/api/2/issue/bulk`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        issueUpdates: chunk.map((t) => ({
          fields: {
            project: { key: c.project },
            summary: t.summary.slice(0, 255),
            description: t.description,
            issuetype: { name: t.issueType },
            labels: t.labels.map((l) => l.replace(/\s+/g, "-")).filter(Boolean),
          },
        })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      issues?: { key: string }[];
      errors?: { failedElementNumber: number; elementErrors?: { errorMessages?: string[]; errors?: Record<string, string> } }[];
      errorMessages?: string[];
    };
    if (!res.ok && !body.issues?.length) {
      const msg = body.errorMessages?.join("; ") || `Jira returned ${res.status}`;
      chunk.forEach((t) => errors.push({ taskId: t.taskId, error: msg }));
      continue;
    }
    // Successful issues come back in request order, skipping the failed elements.
    const failed = new Set((body.errors ?? []).map((e) => e.failedElementNumber));
    let k = 0;
    chunk.forEach((t, idx) => {
      if (failed.has(idx)) return;
      const key = body.issues?.[k++]?.key;
      if (key) created[t.taskId] = key;
    });
    for (const e of body.errors ?? []) {
      const t = chunk[e.failedElementNumber];
      if (!t) continue;
      const detail = [...(e.elementErrors?.errorMessages ?? []), ...Object.values(e.elementErrors?.errors ?? {})].join("; ");
      errors.push({ taskId: t.taskId, error: detail || "Rejected by Jira" });
    }
  }
  return { created, errors };
}
