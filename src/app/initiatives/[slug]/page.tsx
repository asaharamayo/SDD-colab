import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Workspace } from "@/components/Workspace";
import { agentConfigured, agentModel } from "@/lib/agent";
import { confluenceConfigured } from "@/lib/confluence";
import { jiraInfo } from "@/lib/jira";
import { featureDir, getInitiative, remoteInfo, staleness } from "@/lib/repo";
import { STEP_BY_ID, stageViews, stepViews } from "@/lib/speckit";
import type { StepId } from "@/lib/types";

export default async function InitiativePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { slug } = await params;
  const { run } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/initiatives/${slug}`);

  let data;
  try {
    data = await getInitiative(slug);
  } catch {
    notFound();
  }
  if (!data) notFound();
  const remote = await remoteInfo().catch(() => null);
  const stale = await staleness(slug).catch(() => ({}));
  const autorun = run && run in STEP_BY_ID ? (run as StepId) : null;
  const steps = stepViews(data.snapshot);

  return (
    <Workspace
      meta={data.meta}
      steps={steps}
      stages={stageViews(data.snapshot, steps)}
      files={data.snapshot.files}
      hasConstitution={data.snapshot.hasConstitution}
      featurePath={featureDir(slug)}
      remoteUrl={remote?.webUrl ?? null}
      spec={data.snapshot.spec}
      tasks={data.snapshot.tasks}
      analyze={data.snapshot.analyze}
      tasksReviewed={Boolean(data.snapshot.tasksReviewed)}
      jira={jiraInfo()}
      agentEnabled={agentConfigured()}
      model={agentModel()}
      currentUser={{ login: session.user.login, name: session.user.name || session.user.login, role: session.user.role ?? null }}
      autorun={autorun}
      confluenceConfigured={confluenceConfigured()}
      staleness={stale}
    />
  );
}
