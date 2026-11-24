import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"` — we run a custom server (server.mjs) for the
  // Yjs/WebSocket relay, which Next's standalone bundler doesn't trace.
  // The Cursor SDK ships native binaries and must load from node_modules at runtime.
  serverExternalPackages: ["@cursor/sdk"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
