import { BookOpen, Home, ShieldCheck, Wallet } from 'lucide-react';

export function getRoleNavigation(role, options = {}) {
  const normalized = String(role || 'student').toLowerCase();
  const includeAdmin = Boolean(options.includeAdmin);
  const showTutorAgreement = options.showTutorAgreement !== false;

  let links;

  if (normalized === 'admin') {
    links = [
      { to: '/app/admin', label: 'Home', icon: Home, end: true },
      { to: '/app/admin/tutor-agreements', label: 'Agreements', icon: ShieldCheck },
      { to: '/app/admin/tutors', label: 'Tutors', icon: ShieldCheck },
      { to: '/app/admin/requested-subjects', label: 'Subject demand', icon: BookOpen },
      { to: '/app/admin/payments', label: 'Payouts', icon: Wallet },
    ];
  } else if (normalized === 'tutor') {
    links = [
      { to: '/app/tutor', label: 'Home', icon: Home, end: true },
      { to: '/app/tutor/my-classes', label: 'Classes', icon: BookOpen },
      { to: '/app/tutor/payments', label: 'Payment', icon: Wallet },
    ];
    if (showTutorAgreement) {
      links.splice(1, 0, { to: '/app/tutor/agreement', label: 'Agreement', icon: ShieldCheck });
    }
  } else {
    links = [
      { to: '/app/student', label: 'Home', icon: Home, end: true },
      { to: '/app/student/requests', label: 'Classes', icon: BookOpen },
      { to: '/app/student/payment', label: 'Payment', icon: Wallet },
    ];
  }

  if (includeAdmin && normalized !== 'admin') {
    links.push({ to: '/app/admin', label: 'Admin', icon: ShieldCheck });
  }

  return links;
}
