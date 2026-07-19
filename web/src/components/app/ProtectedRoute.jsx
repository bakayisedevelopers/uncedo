import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../hooks/useAdmin';
import LoadingState from '../ui/LoadingState';

function normalizedRole(user) {
  return String(user?.activeRole || user?.role || 'student').toLowerCase();
}

function UnauthorizedState() {
  return (
    <div className="min-h-[55vh] px-4 py-8">
      <div className="mx-auto max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-black text-zinc-900">Admin access required</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You do not currently have permission to access this admin page.
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles, requireAdmin = false }) {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const { isAdmin, isLoadingAdmin } = useAdmin();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isMobileSessionRoom = searchParams.get('source') === 'mobile'
    && location.pathname.startsWith('/app/session/');
  const loadingMessage = isMobileSessionRoom ? 'Loading Session...' : 'Loading...';

  if (isInitializing || (requireAdmin && isLoadingAdmin)) {
    return <LoadingState message={loadingMessage} fullPage />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireAdmin && !isAdmin) {
    return <UnauthorizedState />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(normalizedRole(user))) {
    return <Navigate to="/app" replace />;
  }

  return children;
}
