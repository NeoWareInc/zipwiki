import { Link, NavLink, Outlet } from "react-router-dom";

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "font-semibold text-(--accent)"
    : "text-(--muted) hover:text-(--accent)";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-(--paper)">
      <header className="border-b border-(--border) bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <span className="font-display text-lg font-semibold">ZipWiki Admin</span>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink to="/admin" end className={navClass}>
              Users
            </NavLink>
            <NavLink to="/admin/billing" className={navClass}>
              Billing
            </NavLink>
          </nav>
          <Link
            to="/dashboard"
            className="ml-auto text-sm font-medium text-(--muted) hover:text-(--accent)"
          >
            Back to portal
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
