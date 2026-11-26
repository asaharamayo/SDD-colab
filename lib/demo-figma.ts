/**
 * Demo-only Figma frames. For the walkthrough recording — no real Figma API call.
 * Paste any figma.com design/frame URL; known Bench frames get demo names.
 */

import type { FigmaFrame } from "./types";

export const DEMO_FIGMA_FRAME =
  "https://www.figma.com/design/AbCdEfGhIjKlMnOpQrSt/Bench?node-id=42-1180&t=demo-node-1";

export const DEMO_FIGMA_FRAME_NAME = "Session detail — desktop";

/** Second walkthrough frame — prefill after the first is linked. */
export const DEMO_FIGMA_FRAME_2 =
  "https://www.figma.com/design/AbCdEfGhIjKlMnOpQrSt/Bench?node-id=12-440&t=demo-node-2";

export const DEMO_FIGMA_FRAME_2_NAME = "Session list — desktop";
const KNOWN: Record<string, string> = {
  "42-1180": DEMO_FIGMA_FRAME_NAME,
  "42:1180": DEMO_FIGMA_FRAME_NAME,
  "12-440": DEMO_FIGMA_FRAME_2_NAME,
  "12:440": DEMO_FIGMA_FRAME_2_NAME,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function nodeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get("node-id") ?? u.searchParams.get("nodeId");
  } catch {
    return null;
  }
}

export function nameForFigmaUrl(url: string): string {
  const node = nodeIdFromUrl(url);
  if (node && KNOWN[node]) return KNOWN[node];
  const file = url.match(/figma\.com\/(?:design|file)\/[^/]+\/([^/?#]+)/)?.[1];
  if (file) return decodeURIComponent(file.replace(/-/g, " "));
  return node ? `Frame ${node}` : "Figma frame";
}

export type FigmaSimStep = {
  activity: string;
  delayMs: number;
  chunk?: string;
};

export function figmaSimScript(frame: FigmaFrame, alreadyUploaded: number): FigmaSimStep[] {
  const short = frame.url.replace(/^https?:\/\//, "").slice(0, 72);
  const again = Boolean(frame.uploadedAt);
  return [
    { activity: "Resolving Figma frame…", delayMs: 900 },
    { activity: `Fetching frame export · ${frame.name}`, delayMs: 1400 },
    { activity: "Reading layout + copy from the frame PNG…", delayMs: 1600 },
    {
      activity: again ? `Refreshing “${frame.name}” on the brief…` : "Writing design notes into brief.md…",
      delayMs: 1200,
      chunk: again
        ? `Re-read **${frame.name}** from Figma (\`${short}…\`). Updated its notes on the brief.\n\n`
        : `Pulled **${frame.name}** from Figma (\`${short}…\`).\n\n${
            alreadyUploaded
              ? `Added it alongside the ${alreadyUploaded} frame${alreadyUploaded > 1 ? "s" : ""} already on the brief.\n\n`
              : "Captured it on the brief — screens, copy, and the open questions it raises:\n\n"
          }`,
    },
    {
      activity: "Flagging decisions the brief still owes…",
      delayMs: 1600,
      chunk:
        frame.name.includes("list") || frame.name.includes("List")
          ? `From **${frame.name}**:\n\n1. **[Product]** Filter chips for topic / skill / time — not in the prose scope yet.\n2. **[Quality]** Skeleton loaders while the list fetches — no acceptance for perceived performance.\n\nLinked frames are listed under **Design** on this brief.\n`
          : `From **${frame.name}**:\n\n1. **[Product]** Empty state when search returns zero — illustration + “Host a session”. Keep?\n2. **[Product]** “Saved sessions” on the detail screen — in the frame, not yet in scope.\n3. **[Engineering]** Claim toast with a 5s undo — needs a soft-cancel.\n4. **[Quality]** Host panel → bottom sheet on mobile; start time turns red under 48h.\n\nLinked frames are listed under **Design** on this brief. Settle the Product ones before Specify.\n`,    },
  ];
}

/** Rebuild (or create) the ## Design section from every linked frame. */
export function figmaBriefSection(frames: FigmaFrame[]): string {
  const uploaded = frames.filter((f) => f.uploadedAt);
  const linkedOnly = frames.filter((f) => !f.uploadedAt);
  const lines = [
    "## Design",
    "",
    "Figma frames linked on this brief. Uploaded ones have been read into the notes below.",
    "",
  ];
  if (frames.length === 0) {
    lines.push("_No frames linked yet._");
  } else {
    for (const f of frames) {
      const mark = f.uploadedAt ? "uploaded" : "linked — not uploaded yet";
      lines.push(`- [${f.name}](${f.url}) · ${mark}`);
    }
  }
  if (uploaded.length) {
    lines.push("", "### Captured from uploaded frames", "");
    for (const f of uploaded) {
      lines.push(`#### ${f.name}`, "", `Source: [${f.name}](${f.url})`, "");
      if (f.name.includes("list") || f.name.includes("List")) {
        lines.push(
          "- Session list with topic / skill / time chips.",
          "- Card: title, host, duration, seats left.",
          "- Skeleton state while loading.",
          "",
        );
      } else {
        lines.push(
          "- Session detail: host, skill level, one-tap claim or join waitlist.",
          "- Empty search: illustration and “Host a session”.",
          "- Saved sessions entry on the detail screen.",
          "- Claim confirmation with undo for 5 seconds.",
          "- Mobile: host panel → bottom sheet; start time turns red under 48 hours.",
          "",
        );
      }
    }
    lines.push(
      "Open from the frames:",
      "",
      "- **[Product]** Empty-state CTA and Saved sessions — in or out for the pilot?",
      "- **[Engineering]** Undo implies a soft-cancel, not an immediate write.",
      "- **[Quality]** Acceptance must cover mobile bottom sheet and the 48-hour countdown.",
    );
  } else if (linkedOnly.length) {
    lines.push("", "_Link saved. Upload a frame to pull its screens into this section._");
  }
  return lines.join("\n");
}

/** Replace an existing ## Design section, or append one. */
export function upsertDesignSection(brief: string, frames: FigmaFrame[]): string {
  const section = figmaBriefSection(frames);
  const re = /^## Design\b[\s\S]*?(?=^##\s|\Z)/m;
  if (re.test(brief)) return brief.replace(re, section + "\n\n").replace(/\n{3,}/g, "\n\n");
  return `${brief.replace(/\s*$/, "")}\n\n${section}\n`;
}

export async function runFigmaSim(
  steps: FigmaSimStep[],
  onActivity: (label: string) => void,
  onChunk: (text: string) => void,
) {
  for (const step of steps) {
    onActivity(step.activity);
    await sleep(step.delayMs);
    if (step.chunk) onChunk(step.chunk);
  }
}
