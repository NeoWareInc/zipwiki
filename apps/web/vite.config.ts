import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");
const bufferInject = path.resolve(__dirname, "src/polyfills/buffer-inject.js");

function convexDeploymentUrl(raw: string | undefined): string {
  const url = raw?.trim().replace(/\/+$/, "") ?? "";
  if (!url) return "";
  if (!/^https?:\/\//i.test(url) || !url.includes(".convex.cloud")) {
    return "";
  }
  return url;
}

/**
 * NeoZipKit 1.6.x browser-esm references bare `Buffer` while only assigning
 * `globalThis.Buffer` at the end of the file. Under ESM that is not a lexical
 * binding, so browsers throw `Buffer is not defined`. Prepend a local binding.
 */
function neozipkitBufferShim(): Plugin {
  return {
    name: "neozipkit-buffer-shim",
    enforce: "pre",
    transform(code, id) {
      const norm = id.replace(/\\/g, "/");
      const isKitBrowserBundle =
        norm.includes("/neozipkit/dist/browser-esm/") ||
        norm.includes("/.vite/deps/neozipkit_browser");
      if (!isKitBrowserBundle) return null;
      if (code.includes("/* zipwiki-buffer-shim */")) return null;
      return {
        code:
          `/* zipwiki-buffer-shim */\n` +
          `import { Buffer as __ZipWikiBufferPolyfill } from "buffer";\n` +
          `const Buffer = globalThis.Buffer ?? __ZipWikiBufferPolyfill;\n` +
          `if (typeof globalThis !== "undefined") globalThis.Buffer = Buffer;\n` +
          code,
        map: null,
      };
    },
  };
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
    plugins: [neozipkitBufferShim(), react(), tailwindcss()],
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
      global: "globalThis",
    },
    resolve: {
      alias: {
        "@convex": path.resolve(__dirname, "../../convex"),
        "@public-specs": path.resolve(__dirname, "../../public-specs"),
        buffer: "buffer/",
      },
    },
    optimizeDeps: {
      include: ["buffer", "neozipkit/browser"],
      esbuildOptions: {
        // Injects `import { Buffer } from …` into prebundled deps so bare
        // `Buffer` in neozipkit/browser-esm resolves during `vite dev`.
        inject: [bufferInject],
        define: {
          global: "globalThis",
        },
      },
    },
    server: {
      port: 5173,
      fs: {
        // public-specs/ lives at the monorepo root (synced format AppNotes).
        allow: [repoRoot],
      },
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
