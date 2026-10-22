import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  NAV,
  PAGE_TITLES,
  SHOW_INSTALL_IN_NAV,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "../lib/marketing-copy";
import { useBetaAccessStatus } from "./BetaAccessGate";
import { Logo } from "./Logo";
import { ThemeToggler } from "./ThemeToggler";

export function MarketingLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const access = useBetaAccessStatus();
  const joinReady = access !== undefined;
  const joinLabel =
    access?.mode === "invite"
      ? "Request Invite"
      : access && !access.canJoin
        ? "Join waitlist"
        : "Sign up";
  const joinTo = "/signup";

  useEffect(() => {
    const title = PAGE_TITLES[location.pathname] ?? SITE_NAME;
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", SITE_DESCRIPTION);
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 overflow-visible border-b border-(--line)/70 bg-(--paper)/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          <Link to="/" className="flex shrink-0 items-center text-(--ink)">
            <Logo
              variant="lockup"
              className="h-14 w-auto object-contain object-left sm:h-16"
            />
          </Link>

          <nav className="hidden items-center gap-5 text-sm lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive
                    ? "font-medium text-(--accent)"
                    : "font-medium text-(--muted) transition-colors hover:text-(--accent)"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 text-sm lg:flex">
            <ThemeToggler />
            <Link
              to="/login"
              className="font-medium text-(--muted) transition-colors hover:text-(--accent)"
            >
              Sign in
            </Link>
            {joinReady ? (
              <Link
                to={joinTo}
                className="inline-flex items-center justify-center rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--accent-bright)"
              >
                {joinLabel}
              </Link>
            ) : null}
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggler />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-(--border) text-(--ink)"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="sr-only">Menu</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                {open ? (
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-(--line) px-6 py-4 lg:hidden">
            <nav className="flex flex-col gap-3 text-sm">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    isActive
                      ? "font-medium text-(--accent)"
                      : "font-medium text-(--muted)"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/login"
                  className="font-medium text-(--muted) hover:text-(--accent)"
                >
                  Sign in
                </Link>
                {joinReady ? (
                  <Link
                    to={joinTo}
                    className="inline-flex items-center justify-center rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white"
                  >
                    {joinLabel}
                  </Link>
                ) : null}
              </div>
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="border-t border-(--line) bg-(--surface)/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-(--muted) sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium text-(--ink)">
              {SITE_NAME} — {SITE_TAGLINE}
            </p>
            <p className="mt-1">© 2026 NeoWare Inc.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/mcp" className="hover:text-(--accent)">
              MCP & CLI
            </Link>
            <Link to="/resources" className="hover:text-(--accent)">
              Resources
            </Link>
            {SHOW_INSTALL_IN_NAV && (
              <Link to="/install" className="hover:text-(--accent)">
                Install
              </Link>
            )}
            <Link to="/login" className="hover:text-(--accent)">
              Sign in
            </Link>
            <Link to="/terms" className="hover:text-(--accent)">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-(--accent)">
              Privacy
            </Link>
            <Link to="/contact" className="hover:text-(--accent)">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
