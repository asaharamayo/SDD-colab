import type { Session } from "next-auth";
import { getHostSession } from "./host-session";
import type { Author } from "./repo";

/**
 * Everyone commits as themselves (git author); the host machine is the committer
 * and pushes with the host's GitHub token if one is connected, otherwise with
 * whatever git credentials the host machine already has.
 */
export function resolveWriter(session: Session): { author: Author; pushToken?: string } {
  const login = session.user.login;
  return {
    author: { login, name: session.user.name || login },
    pushToken: session.accessToken || getHostSession()?.accessToken,
  };
}
