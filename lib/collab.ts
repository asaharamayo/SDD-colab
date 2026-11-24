import type { DocRef } from "./types";

// Stable per-person cursor colour from the app accent palette.
const CURSOR_PALETTE = [
  "#1d4ed8",
  "#7F35A9",
  "#12784F",
  "#1D559D",
  "#0f766e",
  "#723D02",
] as const;

export function colorForLogin(login: string): string {
  let hash = 0;
  for (let i = 0; i < login.length; i++) {
    hash = (hash << 5) - hash + login.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % CURSOR_PALETTE.length;
  return CURSOR_PALETTE[idx];
}

export function docRoom(slug: string, doc: DocRef): string {
  return doc.scope === "repo" ? `repo__${doc.path}` : `${slug}__${doc.path}`;
}

export function chatRoom(slug: string): string {
  return `${slug}__chat`;
}

/** Base endpoint for the Yjs relay — `y-websocket`'s client appends `/<room>` itself. */
export function wsBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/yjs`;
}
