import { ConvexReactClient } from "convex/react";

function convexDeploymentUrl(
  raw: string | undefined,
): string | undefined {
  const url = raw?.trim().replace(/\/+$/, "");
  if (!url) return undefined;
  // Vercel env add "VITE_CONVEX_URL production" is a common footgun: the
  // value becomes the word "production", which crashes ConvexReactClient.
  if (!/^https?:\/\//i.test(url) || !url.includes(".convex.cloud")) {
    console.error(
      `VITE_CONVEX_URL must be an absolute Convex URL (https://….convex.cloud). Received ${JSON.stringify(url)}.`,
    );
    return undefined;
  }
  return url;
}

const url = convexDeploymentUrl(
  import.meta.env.VITE_CONVEX_URL as string | undefined,
);

if (!url) {
  console.error(
    "VITE_CONVEX_URL is missing. Add it to the Vercel Production env (same value as CONVEX_URL from `npx convex dev`), then redeploy.",
  );
}

export const convex = new ConvexReactClient(
  url || "https://missing-vite-convex-url.convex.cloud",
);
