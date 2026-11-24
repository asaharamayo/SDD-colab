/**
 * Single-process, in-memory "who is hosting this instance" state.
 *
 * Model: one person runs this app and connects *their*
 * GitHub account once. Everyone else joins via a shared link with just a
 * display name — no GitHub account required. Guest saves are committed
 * using the host's token, credited to the guest via commit message +
 * Co-authored-by trailer.
 *
 * This intentionally lives in process memory, not a database: the product
 * is meant to be run by one host per instance (PRD §4.1 — GitHub is the
 * root of truth; this app is a thin, disposable collaboration layer).
 * Restarting the host process clears it — the host reconnects.
 */

export interface HostSession {
  login: string;
  name: string;
  accessToken: string;
  connectedAt: string;
}

let current: HostSession | null = null;

export function setHostSession(session: HostSession) {
  current = session;
}

export function getHostSession(): HostSession | null {
  return current;
}

export function clearHostSession() {
  current = null;
}
