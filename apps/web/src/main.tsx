import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "./lib/convex";
import { ThemeProvider } from "./components/ThemeProvider";
import { isNoIndexHost, NOINDEX_CONTENT } from "./lib/robots-policy";
import App from "./App";
import "./index.css";

if (isNoIndexHost(window.location.hostname)) {
  for (const name of ["robots", "googlebot"] as const) {
    let el = document.head.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", NOINDEX_CONTENT);
  }
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ConvexAuthProvider client={convex} shouldHandleCode={() => false}>
      <App />
    </ConvexAuthProvider>
  </ThemeProvider>,
);
