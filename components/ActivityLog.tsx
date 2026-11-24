"use client";

import { useEffect, useState } from "react";
import { colorForLogin } from "@/lib/collab";
import type { ActivityEntry } from "@/lib/repo";

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const mins = Math.round((Date.now() - d) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function ActivityLog({ slug, remoteUrl }: { slug: string; remoteUrl: string | null }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/initiatives/${slug}/activity`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setEntries(data.entries);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="max-w-2xl pt-10">
      <p className="eyebrow">Reference only</p>
      <h2 className="heading-2 mt-3">Who edited what</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        Every commit here carries the real author who made the edit, even though everything pushes to
        GitHub under the host&apos;s credentials. This is that record.
      </p>

      {error && (
        <p className="mt-6 rounded-[var(--radius-standard)] px-3 py-2 text-sm" style={{ background: "var(--color-critical-soft)", color: "var(--color-critical)" }}>
          {error}
        </p>
      )}

      {!entries && !error && <p className="mt-8 text-sm text-secondary">Loading…</p>}

      {entries && entries.length === 0 && <p className="mt-8 text-sm text-secondary">Nothing committed yet.</p>}

      {entries && entries.length > 0 && (
        <ul className="mt-6 flex flex-col gap-0.5">
          {entries.map((e) => (
            <li key={e.sha} className="flex items-center gap-3 border-b hairline py-2.5 text-[13px]">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: colorForLogin(e.login) }}
                title={e.name}
              >
                {e.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{e.name}</span>{" "}
                <span className="text-secondary">{e.message.replace(/\s*—\s*@[\w-]+$/, "")}</span>
              </span>
              <span className="shrink-0 text-secondary" title={e.date}>
                {relativeTime(e.date)}
              </span>
              {remoteUrl ? (
                <a className="link shrink-0 font-mono text-secondary" href={`${remoteUrl}/commit/${e.sha}`} target="_blank" rel="noreferrer">
                  {e.sha}
                </a>
              ) : (
                <span className="shrink-0 font-mono text-secondary">{e.sha}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
