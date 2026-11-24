"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function Field({
  label,
  hint,
  value,
  onChange,
  rows = 2,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      {hint && <span className="font-normal text-secondary"> — {hint}</span>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="mt-1.5 w-full" />
    </label>
  );
}

export function NewInitiativeForm({ agentEnabled }: { agentEnabled: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [value, setValue] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [inScope, setInScope] = useState("");
  const [outScope, setOutScope] = useState("");
  const [dependencies, setDependencies] = useState("");
  const [review, setReview] = useState(agentEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, problem, value, hypothesis, inScope, outScope, dependencies, reviewWithAgent: review }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not create feature");
      const q = data.autorun ? `?run=${data.autorun}` : "";
      router.push(`/initiatives/${data.initiative.slug}${q}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-6">
      <label className="text-sm font-medium">
        What are we building?
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1.5 w-full"
          placeholder="Saved searches for a local store"
        />
      </label>
      <Field label="Problem" hint="who is struggling with what, and how do we know?" value={problem} onChange={setProblem} rows={3} />
      <Field label="Intended user value" hint="what gets better for them?" value={value} onChange={setValue} />
      <Field
        label="Hypothesis"
        value={hypothesis}
        onChange={setHypothesis}
        placeholder="We believe [change] will [outcome] for [users], measured by [metric]."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="In scope" hint="one per line" value={inScope} onChange={setInScope} rows={3} />
        <Field label="Out of scope" hint="one per line" value={outScope} onChange={setOutScope} rows={3} />
      </div>
      <Field label="Dependencies" hint="teams, systems, data, decisions" value={dependencies} onChange={setDependencies} />
      <p className="-mt-2 text-[13px] text-secondary">Only the title is required — anything blank becomes a gap to fill in the Brief stage.</p>

      <label className="flex items-start gap-3 border-t hairline pt-6 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={review} disabled={!agentEnabled} onChange={(e) => setReview(e.target.checked)} />
        <span>
          <span className="font-medium">Ask the agent to review the brief for gaps</span>
          <span className="block text-secondary">
            {agentEnabled
              ? "It checks problem, value, hypothesis, scope and dependencies, and tells you whether it's clear enough to specify."
              : "No Cursor agent on this host (CURSOR_API_KEY not set)."}
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-[var(--radius-standard)] px-3 py-2 text-sm" style={{ background: "var(--color-critical-soft)", color: "var(--color-critical)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={saving} className="btn-hero w-fit">
        {saving ? "Creating…" : "Create brief"}
      </button>
    </form>
  );
}
