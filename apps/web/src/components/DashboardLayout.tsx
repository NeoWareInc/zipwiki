import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { MeResponse } from "../lib/api";
import { AccountMenu } from "./AccountMenu";

function LowCreditsBanner() {
  const location = useLocation();
  const usage = useQuery(api.usage.myUsage);
  if (!usage?.lowCredits || usage.creditsUnlimited) return null;
  if (location.pathname.startsWith("/dashboard/billing")) return null;
  return (
    <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Credits running low ({usage.creditsRemaining.toLocaleString()} remaining).{" "}
      <Link
        className="font-semibold text-(--accent) underline"
        to="/dashboard/billing"
      >
        Buy more
      </Link>
    </p>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ${
    isActive
      ? "border-(--accent) bg-(--paper-deep) font-medium text-(--accent)"
      : "border-transparent text-(--ink) hover:border-(--line) hover:bg-(--paper)"
  }`;

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="shrink-0">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="shrink-0">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" strokeLinecap="round" />
      <path d="M16 8.5a3 3 0 1 0 0-6M19 20c0-2.9-1.7-5-4-5.8" strokeLinecap="round" />
    </svg>
  );
}

function SidebarNav({
  isAdmin,
  pathname,
  onNavigate,
}: {
  isAdmin: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const adminActive =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const knowledgeActive =
    pathname === "/dashboard/knowledge" ||
    (pathname.startsWith("/dashboard/knowledge/") &&
      !pathname.startsWith("/dashboard/knowledge/create"));
  const createActive = pathname.startsWith("/dashboard/knowledge/create");

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      <NavLink to="/dashboard" end className={navClass} onClick={onNavigate}>
        <DashboardIcon />
        Dashboard
      </NavLink>
      <NavLink
        to="/dashboard/knowledge/create"
        className={() => navClass({ isActive: createActive })}
        onClick={onNavigate}
      >
        Create ZipWiki
      </NavLink>
      <NavLink
        to="/dashboard/knowledge"
        className={() => navClass({ isActive: knowledgeActive })}
        onClick={onNavigate}
      >
        Knowledge
      </NavLink>
      {isAdmin && (
        <NavLink
          to="/admin"
          className={() => navClass({ isActive: adminActive })}
          onClick={onNavigate}
        >
          <UsersIcon />
          Users
        </NavLink>
      )}
    </nav>
  );
}

function SidebarBody({
  isAdmin,
  me,
  pathname,
  onNavigate,
}: {
  isAdmin: boolean;
  me: MeResponse | undefined;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-5 py-5">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-semibold text-(--ink)"
          onClick={onNavigate}
        >
          <img
            src="/zipwiki-icon.png"
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-[26px] rounded-[7px] shadow-sm"
          />
          ZipWiki
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <SidebarNav
          isAdmin={isAdmin}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </div>
      <div className="border-t border-(--border) p-3">
        <AccountMenu me={me} onNavigate={onNavigate} />
      </div>
    </>
  );
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const profile = useQuery(api.profiles.me);
  const settings = useQuery(api.settings.mine);
  const me: MeResponse | undefined = profile
    ? {
        user: profile.user,
        account: {
          id: profile.account.id,
          name: profile.account.name,
          status: profile.account.status,
          disabled: profile.account.disabled,
        },
        plan: profile.plan,
        usage: {
          parseCount: 0,
          okfCount: 0,
          periodStart: new Date().toISOString(),
        },
      }
    : undefined;
  const isAdmin = me?.user.role === "admin";

  useEffect(() => {
    if (!settings || settings.setupComplete) return;
    if (location.pathname.startsWith("/dashboard/settings")) return;
    navigate("/dashboard/settings?onboarding=1", { replace: true });
  }, [settings, location.pathname, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-(--paper)">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-(--border) bg-white shadow-[1px_0_0_rgba(21,32,43,0.02)] md:flex">
        <SidebarBody
          isAdmin={Boolean(isAdmin)}
          me={me}
          pathname={location.pathname}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-(--border) bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            className="rounded-lg border border-(--border) px-2.5 py-1.5 text-sm"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar"
            onClick={() => setMobileOpen((v) => !v)}
          >
            Menu
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-base font-semibold text-(--ink)"
          >
            <img
              src="/zipwiki-icon.png"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] rounded-[6px] shadow-sm"
            />
            ZipWiki
          </Link>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-(--ink)/40"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside
              id="mobile-sidebar"
              className="absolute inset-y-0 left-0 flex w-60 max-w-[85vw] flex-col bg-white shadow-xl"
            >
              <SidebarBody
                isAdmin={Boolean(isAdmin)}
                me={me}
                pathname={location.pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <LowCreditsBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
