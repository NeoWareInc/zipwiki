import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import type { MeResponse } from "../lib/api";

function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Props = {
  me: MeResponse | undefined;
  onNavigate?: () => void;
};

export function AccountMenu({ me, onNavigate }: Props) {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await signOut();
    navigate("/login");
  }

  function go(path: string) {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  }

  const email = me?.user.email ?? "";
  const name = email ? displayName(email) : "Account";
  const initial = (email[0] ?? "Z").toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-(--border) bg-white shadow-lg"
        >
          <MenuItem
            icon={<GearIcon />}
            label="Settings"
            onClick={() => go("/dashboard/settings")}
          />
          <MenuItem
            icon={<KeyIcon />}
            label="API keys"
            onClick={() => go("/dashboard/keys")}
          />
          <MenuItem
            icon={<CardIcon />}
            label="Billing"
            onClick={() => go("/dashboard/billing")}
          />
          <div className="border-t border-(--border)" />
          <MenuItem
            icon={<LogoutIcon />}
            label="Log out"
            onClick={() => void logout()}
          />
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-(--paper)"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--accent) text-sm font-semibold text-white"
          aria-hidden
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-(--ink)">
            {name}
          </span>
          {email && (
            <span className="block truncate text-xs text-(--muted)">
              {email}
            </span>
          )}
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--ink) text-white transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <ChevronIcon />
        </span>
      </button>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-(--paper)"
      onClick={onClick}
    >
      <span className="text-(--muted)">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M11.5 12.5 20 4l2 2-2 2-2-1-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
      <path d="M15 12H3m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
