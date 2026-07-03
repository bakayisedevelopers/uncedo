import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AppHomeRedirect() {
  const { user } = useAuth();
  const activeRole = String(user?.activeRole || user?.role || 'student').toLowerCase();

  if (activeRole === 'admin') {
    return <Navigate to="/app/admin" replace />;
  }

  if (activeRole === 'tutor') {
    return <Navigate to="/app/tutor" replace />;
  }

  return <Navigate to="/app/student" replace />;
}
