import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  DOCS_URL,
  NAV,
  PAGE_TITLES,
  SITE_DESCRIPTION,
  SITE_NAME,
  WAITLIST_HREF,
} from "../lib/marketing-copy";

export function MarketingLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

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
      <header className="sticky top-0 z-20 border-b border-(--line)/70 bg-(--paper)/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-(--ink)">
            <img
              src="/zipwiki-icon.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-[9px] shadow-sm"
            />
            <span className="font-display text-xl font-semibold tracking-tight">
              {SITE_NAME}
            </span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
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
            <WaitlistLinks />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-(--border) text-(--ink) lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
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

        {open && (
          <div className="border-t border-(--line) px-6 py-4 lg:hidden">
            <nav className="flex flex-col gap-3 text-sm">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive
                      ? "font-medium text-(--accent)"
                      : "font-medium text-(--muted)"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="flex flex-wrap gap-3 pt-2">
                <WaitlistLinks />
              </div>
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="border-t border-(--line) bg-white/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-(--muted) sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium text-(--ink)">
              ZipWiki — install the plugin, keep a .zipwiki
            </p>
            <p className="mt-1">© 2026 NeoWare Inc.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/#plugin" className="hover:text-(--accent)">
              Plugin
            </Link>
            <Link to="/pricing" className="hover:text-(--accent)">
              Pricing
            </Link>
            <a href={DOCS_URL} className="hover:text-(--accent)">
              Docs
            </a>
            <Link to="/terms" className="hover:text-(--accent)">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-(--accent)">
              Privacy
            </Link>
            <a href="mailto:hello@zipwiki.ai" className="hover:text-(--accent)">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function WaitlistLinks() {
  return (
    <>
      <a
        href={DOCS_URL}
        className="font-medium text-(--muted) hover:text-(--accent)"
      >
        Docs
      </a>
      <a
        href={WAITLIST_HREF}
        className="inline-flex items-center justify-center rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--accent-bright)"
      >
        Join waitlist
      </a>
    </>
  );
}
