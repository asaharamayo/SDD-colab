/** tasks.md → Jira-shaped tickets, and the CSV Jira's importer reads. Shared by client and server. */

export interface DraftTicket {
  taskId: string;
  include: boolean;
  summary: string;
  issueType: string;
  labels: string[];
  description: string;
  phase: string;
  story: string | null;
  parallel: boolean;
  done: boolean;
}

export const ISSUE_TYPES = ["Task", "Story", "Bug", "Spike"];

const TASK_LINE = /^\s*[-*]\s+\[( |x|X)\]\s+(T\d{2,})\b\s*(.*)$/;

function plain(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\s+/g, " ").trim();
}

export function ticketsFromTasks(md: string, slug: string, existing: Record<string, string> = {}): DraftTicket[] {
  const out: DraftTicket[] = [];
  let phase = "";
  for (const line of md.split("\n")) {
    const h = line.match(/^#{2,3}\s+(.+)$/);
    if (h) {
      phase = plain(h[1]);
      continue;
    }
    const m = line.match(TASK_LINE);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    let rest = m[3];
    let parallel = false;
    let story: string | null = null;
    for (;;) {
      const tag = rest.match(/^\[(P|US\d+)\]\s*/);
      if (!tag) break;
      if (tag[1] === "P") parallel = true;
      else story = tag[1];
      rest = rest.slice(tag[0].length);
    }
    const text = plain(rest);
    const labels = ["sdd", slug, ...(story ? [story.toLowerCase()] : []), ...(parallel ? ["parallel"] : [])];
    const description = [
      text,
      "",
      phase && `Phase: ${phase}`,
      story && `User story: ${story}`,
      parallel && "Can run in parallel with other [P] tasks.",
      `Source: specs/${slug}/tasks.md (${m[2]})`,
    ]
      .filter((l) => l !== false && l !== null && l !== undefined)
      .join("\n")
      .trim();
    out.push({
      taskId: m[2],
      include: !done && !existing[m[2]],
      summary: `${m[2]} ${text}`.slice(0, 255),
      issueType: story ? "Story" : "Task",
      labels,
      description,
      phase,
      story,
      parallel,
      done,
    });
  }
  return out;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/** Jira's CSV importer maps repeated "Labels" columns to multiple labels. */
export function ticketsToCsv(tickets: DraftTicket[]): string {
  const maxLabels = Math.max(1, ...tickets.map((t) => t.labels.length));
  const header = ["Summary", "Issue Type", "Description", ...Array(maxLabels).fill("Labels"), "Task ID", "Phase"];
  const rows = tickets.map((t) => [
    t.summary,
    t.issueType,
    t.description,
    ...Array.from({ length: maxLabels }, (_, i) => (t.labels[i] ?? "").replace(/\s+/g, "-")),
    t.taskId,
    t.phase,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
