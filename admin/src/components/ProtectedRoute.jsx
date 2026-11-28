import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';

function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dashboard-radial px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-ink-900/80 px-6 py-8 text-center text-ink-100 shadow-glow backdrop-blur">
        <img
          src="/admin-wordmark-light.png"
          alt="Uncedo Admin"
          referrerPolicy="no-referrer"
          className="mx-auto mb-5 h-11 w-auto shrink-0 object-contain"
        />
        <div className="mx-auto mb-3 h-1 w-16 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full animate-pulse rounded-full bg-brand" />
        </div>
        <p className="text-sm font-medium tracking-wide text-ink-200">{message}</p>
      </div>
    </div>
  );
}

function UnauthorizedState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <div className="max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 text-center shadow-glow backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/15 text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-white">Admin access required</h2>
        <p className="mt-2 text-sm leading-6 text-ink-200">
          Your account is signed in, but it does not have permission to open the admin console.
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const { isAdmin, isLoadingAdmin } = useAdmin();
  const location = useLocation();

  if (isInitializing || isLoadingAdmin) {
    return <LoadingState message="Loading admin console..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    return <UnauthorizedState />;
  }

  return children;
}
