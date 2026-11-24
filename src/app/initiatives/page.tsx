import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StagePill } from "@/components/Badges";
import { listInitiatives, remoteInfo } from "@/lib/repo";
import type { InitiativeSummary } from "@/lib/types";

export default async function InitiativesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/initiatives");

  let items: InitiativeSummary[] = [];
  let error: string | null = null;
  try {
    items = await listInitiatives();
  } catch (err) {
    error = (err as Error).message;
  }
  const remote = await remoteInfo().catch(() => null);

  return (
    <div className="mx-auto max-w-5xl px-6 pt-16 pb-20">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">specs/</p>
          <h1 className="heading-2 mt-2">Features</h1>
          <p className="mt-2 text-sm text-secondary">
            Each feature is a Spec Kit folder in {remote?.webUrl ? "the specs repo" : "the host's local git repo"}.
          </p>
        </div>
        <Link href="/initiatives/new" className="btn-primary">
          Start a feature
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-[var(--radius-standard)] px-3 py-2 text-sm" style={{ background: "var(--color-critical-soft)", color: "var(--color-critical)" }}>
          {error}
        </p>
      )}

      <ul className="mt-10 grid gap-3">
        {items.length === 0 && !error && (
          <li className="card text-center text-sm text-secondary py-14">
            Nothing here yet. Start a feature and the agent will draft the first spec.
          </li>
        )}
        {items.map((item) => (
          <li key={item.slug}>
            <Link href={`/initiatives/${item.slug}`} className="card card-hover flex items-center gap-6 !py-5">
              <span className="font-mono text-sm text-secondary w-10">{item.number}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{item.title}</div>
                <div className="mt-0.5 truncate text-[13px] text-secondary">
                  {item.files.length ? item.files.join(" · ") : "No documents yet"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StagePill stage={item.stage} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
