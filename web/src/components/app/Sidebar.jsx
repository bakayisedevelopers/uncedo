import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck, UserCircle2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useAdmin';
import { hasCurrentTutorAgreement } from '../../utils/onboarding';
import { getRoleNavigation } from '../../constants/navigation';
import ReferralShareButton from './ReferralShareButton';

const baseClass = 'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-all';

export default function Sidebar({ role, onNavigate, mobile = false }) {
  const { isAdmin } = useAdmin();
  const { logout, user } = useAuth();
  const links = getRoleNavigation(role, {
    includeAdmin: isAdmin,
    showTutorAgreement: role === 'tutor' && !hasCurrentTutorAgreement(user),
  });
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    onNavigate?.();
    navigate('/login');
  };

  return (
    <aside className="flex h-full w-full flex-col rounded-[2rem] border border-zinc-200 bg-white/95 p-4 shadow-[0_28px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-6 flex items-center justify-between px-2 pt-1">
        <Link to="/app" onClick={onNavigate} className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Parakleo logo"
            className="h-10 w-10 rounded-2xl object-cover shadow-sm ring-1 ring-zinc-200"
          />
          <div>
            <p className="text-sm font-bold tracking-tight text-zinc-900">Parakleo</p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{role} workspace</p>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </span>
              ) : null}
            </div>
          </div>
        </Link>
        {mobile ? (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-xl border border-zinc-200 p-2 text-zinc-600"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="space-y-1.5">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={Boolean(end)}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${baseClass} ${isActive
                ? 'bg-brand text-white shadow-sm shadow-emerald-200'
                : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'}`
            }
          >
            <Icon className="h-4 w-4 transition-transform group-hover:scale-110" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {!mobile ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <p className="font-semibold">Tip</p>
          <p className="mt-1 leading-relaxed">Keep your profile and availability up to date for a smoother matching experience.</p>
        </div>
      ) : null}

      <div className="mt-auto border-t border-zinc-200 pt-4">
        <div className="mb-3 grid grid-cols-2 gap-2 px-1 text-[11px] font-semibold text-zinc-500">
          <Link to="/terms" onClick={onNavigate} className="hover:text-zinc-900">Terms</Link>
          <Link to="/privacy-policy" onClick={onNavigate} className="hover:text-zinc-900">Privacy</Link>
          <Link to="/payment-pricing-policy" onClick={onNavigate} className="hover:text-zinc-900">Payments</Link>
          <Link to="/refund-policy" onClick={onNavigate} className="hover:text-zinc-900">Refunds</Link>
          <Link to="/data-voice-policy" onClick={onNavigate} className="col-span-2 hover:text-zinc-900">Data and voice handling</Link>
        </div>
        {role === 'student' ? (
          <ReferralShareButton
            referralSlug={user?.referralSlug || user?.referralCode}
            className="mb-3"
            showIntro={false}
          />
        ) : null}
        <NavLink
          to="/app/profile"
          onClick={onNavigate}
          className={({ isActive }) =>
            `${baseClass} ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'}`
          }
        >
          <UserCircle2 className="h-4 w-4" />
          Profile
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className={`${baseClass} mt-1 w-full text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900`}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
