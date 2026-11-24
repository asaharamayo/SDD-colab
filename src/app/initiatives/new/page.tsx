import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { agentConfigured } from "@/lib/agent";
import { NewInitiativeForm } from "./NewInitiativeForm";

export default async function NewInitiativePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/initiatives/new");

  return (
    <div className="mx-auto max-w-2xl px-6 pt-16 pb-24">
      <p className="eyebrow">Stage 1 · Brief</p>
      <h1 className="heading-2 mt-2">Start a feature</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        A clear-enough brief comes first. This creates <code>specs/NNN-feature/brief.md</code> in the repo; the
        spec is drafted from it once the outcome and scope are settled.
      </p>
      <NewInitiativeForm agentEnabled={agentConfigured()} />
    </div>
  );
}
