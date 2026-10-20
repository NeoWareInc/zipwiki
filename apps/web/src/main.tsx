import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex } from "./lib/convex";
import { ThemeProvider } from "./components/ThemeProvider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ConvexAuthProvider client={convex} shouldHandleCode={() => false}>
      <App />
    </ConvexAuthProvider>
  </ThemeProvider>,
);
