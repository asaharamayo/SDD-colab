export function StagePill({ stage }: { stage: { n: number; label: string } | null }) {
  return (
    <span className="pill">
      <span className="dot" style={{ background: stage ? "var(--color-brand-accent)" : "var(--color-positive)" }} />
      {stage ? `Stage ${stage.n}/5 · ${stage.label}` : "Validated"}
    </span>
  );
}
