import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { getHostSession, setHostSession } from "@/lib/host-session";

const githubConfigured = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...(githubConfigured
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID!,
            clientSecret: process.env.AUTH_GITHUB_SECRET!,
            authorization: {
              params: {
                // repo scope: the host's token is what actually commits
                scope: "read:user user:email repo",
              },
            },
          }),
        ]
      : []),
    Credentials({
      id: "guest",
      name: "Join via link",
      credentials: {
        name: { label: "Display name", type: "text" },
        login: { label: "Handle", type: "text" },
        role: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        const login =
          (credentials?.login as string)?.trim().toLowerCase().replace(/\s+/g, "-") ||
          "guest";
        const name = (credentials?.name as string)?.trim() || login;
        const rawRole = (credentials?.role as string)?.trim();
        const role = rawRole === "product" || rawRole === "engineering" || rawRole === "quality" ? rawRole : null;
        return {
          id: `guest:${login}`,
          name,
          login,
          email: `${login}@guest.local`,
          isGuest: true,
          role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "github" && account.access_token) {
        token.accessToken = account.access_token;
        token.isHost = true;
        token.login =
          profile && "login" in profile ? (profile.login as string) : token.login;
        // The first (and, in this self-host model, only) GitHub-connected
        // person becomes the host for this running instance.
        setHostSession({
          login: token.login as string,
          name: (token.name as string) || (token.login as string),
          accessToken: account.access_token,
          connectedAt: new Date().toISOString(),
        });
      } else if (account?.provider === "guest") {
        token.isHost = false;
        token.login = user && "login" in user ? (user.login as string) : token.login;
        token.role = user && "role" in user ? (user.role ?? null) : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.login = (token.login as string) || session.user.name || "unknown";
        session.user.isHost = Boolean(token.isHost);
        session.user.role = token.role ?? null;
        session.accessToken = token.accessToken as string | undefined;
      }
      // Host connectivity is process-wide, not per-session — surface it so
      // UI can show "hosted by @x" / "waiting for host" without a round trip.
      session.hostLogin = getHostSession()?.login;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
});
