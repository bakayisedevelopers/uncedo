import { NavLink } from 'react-router-dom';
import { BookOpen, Home, ShieldCheck, UserCircle2, Wallet } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useAdmin';
import { hasCurrentTutorAgreement } from '../../utils/onboarding';

function navConfig(role, isAdmin = false) {
  if (role === 'tutor') {
    const tutorLinks = [
      { to: '/app/tutor', label: 'Home', icon: Home, end: true },
      { to: '/app/tutor/my-classes', label: 'Classes', icon: BookOpen },
      { to: '/app/tutor/payments', label: 'Payment', icon: Wallet },
      { to: '/app/profile', label: 'Profile', icon: UserCircle2 },
    ];

    if (isAdmin) {
      tutorLinks.push({ to: '/app/admin', label: 'Admin', icon: ShieldCheck });
    }

    return tutorLinks;
  }

  const studentLinks = [
    { to: '/app/student/requests', label: 'Classes', icon: BookOpen },
    { to: '/app/student', label: 'Home', icon: Home, end: true },
    { to: '/app/student/payment', label: 'Payment', icon: Wallet },
    { to: '/app/profile', label: 'Profile', icon: UserCircle2 },
  ];

  if (isAdmin) {
    studentLinks.push({ to: '/app/admin', label: 'Admin', icon: ShieldCheck });
  }

  return studentLinks;
}

export default function AppBottomNav({ role = 'student' }) {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const links = navConfig(role, isAdmin).filter((link) => {
    if (role === 'tutor' && link.to === '/app/tutor/agreement') {
      return !hasCurrentTutorAgreement(user);
    }
    return true;
  });

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-3">
      <div
        className="pointer-events-auto grid items-center gap-1 rounded-[26px] border border-zinc-200 bg-white/95 px-2 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
      >
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={Boolean(end)}
            aria-label={label}
            title={label}
            className={({ isActive }) =>
              `flex h-11 min-w-11 flex-col items-center justify-center rounded-2xl border transition ${isActive
                ? 'border-emerald-500/30 bg-emerald-50 text-emerald-700'
                : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'}`
            }
          >
            <Icon className="h-4 w-4" />
            <span className="mt-0.5 text-[10px] font-semibold">{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
