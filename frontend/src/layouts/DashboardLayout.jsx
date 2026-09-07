import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import Logo from "../components/Logo.jsx";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-xl px-4 py-2.5 text-sm font-medium transition ${
          isActive ? "bg-neon-600 text-white shadow-neon-glow" : "text-neon-100 hover:bg-neon-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * Shared dashboard shell (sidebar + header) for patient/doctor/admin pages.
 * `navItems` controls which links render, so a user is never shown navigation
 * they are not authorized to use (see ui-ux.md).
 */
export default function DashboardLayout({ title, subtitle, navItems, children }) {
  const { session, logout } = useAuth();

  return (
    <div className="min-h-screen bg-neon-50 lg:flex">
      <aside className="w-full bg-gradient-to-b from-neon-950 to-neon-800 p-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-shrink-0">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo size="sm" />
          <div>
            <p className="text-lg font-bold text-white leading-tight">ELARA</p>
            <p className="text-xs text-neon-300">Heart Health Companion</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to}>
              {item.label}
            </NavItem>
          ))}
          <button
            onClick={logout}
            className="mt-4 block rounded-xl px-4 py-2.5 text-left text-sm font-medium text-neon-100 transition hover:bg-neon-800"
          >
            Logout
          </button>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neon-100 bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-neon-950">{title}</h1>
            {subtitle && <p className="text-sm text-neon-600">{subtitle}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-neon-800">{session?.username}</p>
            <p className="text-xs capitalize text-neon-500">{session?.role}</p>
          </div>
        </header>

        <main className="p-6">{children}</main>

        <footer className="px-6 py-4 text-center text-xs text-neon-400">
          ELARA - Explainable Reinforcement Learning and IoT for Heart Disease Prediction
        </footer>
      </div>
    </div>
  );
}
