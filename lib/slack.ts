/**
 * Real Slack notification path: an Incoming Webhook posts into one fixed
 * channel. Set SLACK_WEBHOOK_URL (self-serve, no admin approval needed —
 * api.slack.com/apps → Create New App → Incoming Webhooks → Add New Webhook
 * to Workspace → pick a channel → copy the URL).
 *
 * Optional per-role SLACK_USER_<ROLE> env vars (a Slack member ID, found via
 * "Copy member ID" on a profile) turn the mention into a real `<@U…>` ping
 * that notifies that specific person, not just the channel.
 */
import type { LensId } from "./speckit";

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}

function slackUserId(role: LensId): string | undefined {
  const key = `SLACK_USER_${role.toUpperCase()}`;
  return process.env[key] || undefined;
}

export function mentionFor(role: LensId, fallbackName?: string | null): string {
  const id = slackUserId(role);
  if (id) return `<@${id}>`;
  return fallbackName ? `*${fallbackName}*` : `whoever's tagged *${role}*`;
}

export async function notifySlack(text: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { ok: false, error: "SLACK_WEBHOOK_URL not set on this host." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Slack returned ${res.status}${body ? `: ${body}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
