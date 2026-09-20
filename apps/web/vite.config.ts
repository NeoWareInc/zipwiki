import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

function convexDeploymentUrl(raw: string | undefined): string {
  const url = raw?.trim().replace(/\/+$/, "") ?? "";
  if (!url) return "";
  if (!/^https?:\/\//i.test(url) || !url.includes(".convex.cloud")) {
    return "";
  }
  return url;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const convexUrl = convexDeploymentUrl(
    process.env.VITE_CONVEX_URL ||
      process.env.CONVEX_URL ||
      env.VITE_CONVEX_URL ||
      env.CONVEX_URL,
  );
  const apiUrl =
    process.env.VITE_API_URL?.trim() || env.VITE_API_URL?.trim() || "";
  const proxyTarget = apiUrl || "https://zipwiki-api-dev.fly.dev";

  return {
    plugins: [react(), tailwindcss()],
    base: "/",
    envDir: repoRoot,
    experimental: {
      renderBuiltUrl(filename) {
        return `/${filename}`;
      },
    },
    define: {
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
      "import.meta.env.VITE_API_URL": JSON.stringify(
        apiUrl || env.VITE_API_URL || "",
      ),
    },
    resolve: {
      alias: {
        "@convex": path.resolve(__dirname, "../../convex"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // SPA routes must not be proxied. Fly only needs API prefixes —
        // a blanket `/auth` steals `/signed-in` cousins like `/auth/callback`.
        "/api": proxyTarget,
        "/auth/device": proxyTarget,
        "/account": proxyTarget,
        "/webhooks": proxyTarget,
        "/health": proxyTarget,
      },
    },
  };
});
