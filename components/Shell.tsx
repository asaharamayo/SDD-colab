import Link from "next/link";
import { auth, signOut } from "@/auth";
import { colorForLogin } from "@/lib/collab";
import { remoteInfo } from "@/lib/repo";

export async function Shell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const remote = await remoteInfo().catch(() => null);

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b hairline">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 font-display text-[15px]">
              <span className="dot" style={{ background: "var(--color-brand-accent)", width: 10, height: 10 }} />
              SDD Colab
            </Link>
            {session?.user && (
              <nav className="flex items-center gap-1 text-sm">
                <Link href="/initiatives" className="btn-ghost">
                  Features
                </Link>
                <Link href="/initiatives/new" className="btn-ghost">
                  New
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {remote && (
              <span className="pill" title={remote.dir}>
                <span className="dot" style={{ background: remote.webUrl ? "var(--color-positive)" : "var(--color-field)" }} />
                {remote.webUrl ? (
                  <a href={remote.webUrl} target="_blank" rel="noreferrer">
                    {remote.webUrl.replace("https://github.com/", "")} · {remote.branch}
                  </a>
                ) : (
                  <>local git · {remote.branch}</>
                )}
              </span>
            )}
            {session?.user ? (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: colorForLogin(session.user.login) }}
                  title={session.user.name ?? session.user.login}
                >
                  {(session.user.name || session.user.login).slice(0, 1).toUpperCase()}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button type="submit" className="btn-ghost btn-sm">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <Link href="/login" className="btn-secondary btn-sm">
                Join
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
