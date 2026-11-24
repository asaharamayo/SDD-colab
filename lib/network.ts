import os from "node:os";

export function lanAddress(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  // 0.0.0.0 is the bind-all address next prints as "Network" — still the host machine.
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "0.0.0.0";
}

/**
 * What the host banner shows. Looks like a hosted join link for the walkthrough.
 * Display only — opening it does not reach this machine.
 */
export const DEMO_SHARE_URL = "https://sdd.example.com";

/** The link the host should hand out: their LAN address instead of localhost. */
export function shareUrl(host: string | null, proto: string): string {
  const port = host?.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? "3000";
  if (isLoopbackHost(host)) {
    const ip = lanAddress();
    if (ip) return `http://${ip}:${port}`;
  }
  return `${proto}://${host ?? `localhost:${port}`}`;
}
