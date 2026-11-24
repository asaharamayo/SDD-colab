/**
 * Minimal Confluence Cloud REST client. Keeps the brief's linked Confluence
 * page (the PRD) in sync with brief.md so Product doesn't have to paste
 * between two tools. GitHub stays the source of truth — this is a mirror,
 * pushed on request (and best-effort after a commit).
 */

export function confluenceConfigured(): boolean {
  return Boolean(process.env.CONFLUENCE_BASE_URL && process.env.CONFLUENCE_EMAIL && process.env.CONFLUENCE_API_TOKEN);
}

export function parseConfluencePageId(url: string): string | null {
  return url.match(/\/pages\/(\d+)/)?.[1] ?? null;
}

function authHeader(): string {
  const basic = Buffer.from(`${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`).toString("base64");
  return `Basic ${basic}`;
}

function baseUrl(): string {
  return (process.env.CONFLUENCE_BASE_URL ?? "").replace(/\/$/, "");
}

/** Small, intentionally lossy markdown → Confluence storage-format (XHTML) converter. */
export function markdownToStorage(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);

    if (h) {
      closeList();
      const level = Math.min(h[1].length + 1, 6);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (task) {
      if (list !== "ul") {
        closeList();
        out.push('<ac:task-list>');
        list = "ul";
      }
      out.push(
        `<ac:task><ac:task-status>${task[1].trim() ? "complete" : "incomplete"}</ac:task-status><ac:task-body>${inline(task[2])}</ac:task-body></ac:task>`,
      );
    } else if (bullet) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (ordered) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(ordered[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  // task-list needs the matching close tag, not </ul>
  return out.join("\n").replace(/<ac:task-list>([\s\S]*?)(?=<\/ul>)<\/ul>/g, "<ac:task-list>$1</ac:task-list>");
}

export type ConfluencePushResult = { ok: true; version: number; url: string } | { ok: false; error: string };

export async function pushMarkdownToConfluence(url: string, markdown: string): Promise<ConfluencePushResult> {
  if (!confluenceConfigured()) return { ok: false, error: "CONFLUENCE_BASE_URL / CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN not set" };
  const pageId = parseConfluencePageId(url);
  if (!pageId) return { ok: false, error: "Couldn't find a page ID in that URL (expected .../pages/<id>/...)" };
  try {
    const getRes = await fetch(`${baseUrl()}/wiki/rest/api/content/${pageId}?expand=version`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    if (!getRes.ok) return { ok: false, error: `Confluence lookup failed (${getRes.status})` };
    const page = (await getRes.json()) as { title: string; version: { number: number } };
    const nextVersion = page.version.number + 1;
    const putRes = await fetch(`${baseUrl()}/wiki/rest/api/content/${pageId}`, {
      method: "PUT",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pageId,
        type: "page",
        title: page.title,
        version: { number: nextVersion },
        body: { storage: { value: markdownToStorage(markdown), representation: "storage" } },
      }),
    });
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => "");
      return { ok: false, error: `Confluence update failed (${putRes.status}) ${detail.slice(0, 200)}` };
    }
    return { ok: true, version: nextVersion, url };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
