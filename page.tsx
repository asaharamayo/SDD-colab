import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getHostSession } from "@/lib/host-session";
import { isLoopbackHost } from "@/lib/network";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const next = params.callbackUrl || "/initiatives";
  if (session?.user) redirect(next);

  const hdrs = await headers();
  const onHostMachine = isLoopbackHost(hdrs.get("x-forwarded-host") || hdrs.get("host"));
  const githubConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  const host = getHostSession();

  return (
    <div className="mx-auto max-w-md px-6 pt-24 pb-16">
      <p className="eyebrow">{onHostMachine ? "You're on the host machine" : "Join"}</p>
      <h1 className="heading-2 mt-3">What should we call you?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        Your name shows next to your cursor and on the commits you save.
      </p>

      {params.error && (
        <p className="mt-6 rounded-[var(--radius-standard)] px-3 py-2 text-sm" style={{ background: "var(--color-critical-soft)", color: "var(--color-critical)" }}>
          Sign-in failed ({params.error})
        </p>
      )}

      <form
        className="mt-8 flex flex-col gap-4"
        action={async (formData) => {
          "use server";
          try {
            await signIn("guest", {
              name: String(formData.get("name") || ""),
              login: String(formData.get("login") || ""),
              role: String(formData.get("role") || ""),
              redirectTo: next,
            });
          } catch (err) {
            if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
            throw err;
          }
        }}
      >
        <label className="text-sm font-medium">
          Name
          <input name="name" required autoFocus className="mt-1.5 w-full" placeholder="Alex Chen" />
        </label>
        <label className="text-sm font-medium">
          Handle <span className="font-normal text-secondary">— how your edits are credited in the activity log</span>
          <input name="login" required className="mt-1.5 w-full" placeholder="alex" />
        </label>
        <fieldset className="text-sm font-medium">
          <legend>
            Your role <span className="font-normal text-secondary">— who you are, so the right questions reach you</span>
          </legend>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["product", "Product"],
                ["engineering", "Engineering"],
                ["quality", "Quality"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="pill cursor-pointer has-[:checked]:!border-[var(--color-form-accent)] has-[:checked]:!bg-[var(--color-form-accent-soft)] has-[:checked]:!text-[var(--color-form-accent)]">
                <input type="radio" name="role" value={value} className="sr-only" defaultChecked={value === "product"} />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 font-normal text-secondary">
            This only decides which questions notify you. You can still look through any role&apos;s questions once you&apos;re in.
          </p>
        </fieldset>
        <button type="submit" className="btn-primary mt-2">
          Join workspace
        </button>
      </form>

      {onHostMachine && (
        <div className="mt-12 border-t hairline pt-8">
          <h2 className="heading-4">Hosting with your GitHub account</h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Optional. Without it, saves push with this machine&apos;s existing git credentials.
            {host && <> Currently connected: @{host.login}.</>}
          </p>
          {githubConfigured ? (
            <form
              className="mt-4"
              action={async () => {
                "use server";
                try {
                  await signIn("github", { redirectTo: next });
                } catch (err) {
                  if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
                  throw err;
                }
              }}
            >
              <button type="submit" className="btn-secondary">
                Continue with GitHub
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-secondary">
              Set <code>AUTH_GITHUB_ID</code> and <code>AUTH_GITHUB_SECRET</code> in <code>.env.local</code> to enable.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
