import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  BarChart3,
  FileText,
  Menu,
  LogOut,
  Shield,
  Sparkles,
  Users,
  FileImage,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logoutUser } from '../services/authService';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: BarChart3 },
  { to: '/helpers', label: 'Helpers', icon: Users },
  { to: '/services', label: 'Services', icon: BadgeCheck },
  { to: '/customers', label: 'Customers', icon: FileImage },
  { to: '/helper-agreements', label: 'Helper agreements', icon: FileText },
];

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
        isActive
          ? 'bg-brand text-white shadow-lg shadow-brand/20'
          : 'text-ink-200 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AdminShell() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const title = useMemo(() => {
    if (location.pathname.startsWith('/helpers')) return 'Helper control';
    if (location.pathname.startsWith('/services')) return 'Services';
    if (location.pathname.startsWith('/customers')) return 'Customer directory';
    if (location.pathname.startsWith('/helper-agreements')) return 'Helper agreements';
    return 'Operations overview';
  }, [location.pathname]);

  const handleLogout = async () => {
    await logoutUser();
  };

  return (
    <div className="min-h-screen bg-dashboard-radial text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <aside className={`fixed inset-y-0 left-0 z-40 w-80 border-r border-white/10 bg-ink-900/96 px-5 py-6 shadow-2xl shadow-black/30 backdrop-blur transition-transform duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex h-full flex-col gap-6">
            <div className="flex items-start justify-between">
              <Link to="/dashboard" className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/20 text-brand-soft">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-ink-300">Uncedo</p>
                  <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/5 p-2 text-ink-200 lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/20 text-brand-soft">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-300">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-white">{user?.email || 'Admin'}</p>
                </div>
              </div>
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} onClick={() => setMenuOpen(false)} />
              ))}
            </nav>

            <div className="mt-auto space-y-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-ink-100 transition hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>

              <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-brand/15 to-amber-500/10 p-4 text-sm text-ink-200">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-soft/80">Moderation policy</p>
                <p className="mt-2 leading-6">
                  Review helper photos, approve useful services, and suspend bad actors without deleting their history.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {menuOpen ? <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenuOpen(false)} /> : null}

        <main className="flex-1 px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="mb-6 flex items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/5 px-4 py-4 shadow-glow backdrop-blur sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-soft/80">Admin console</p>
              <h2 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
}
