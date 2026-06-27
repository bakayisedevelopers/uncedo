import { Navigate, Route, Routes } from 'react-router-dom';
import AdminShell from './components/AdminShell';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import HelperAgreementsPage from './pages/HelperAgreementsPage';
import LoginPage from './pages/LoginPage';
import ProvidersPage from './pages/ProvidersPage';
import ServicesPage from './pages/ServicesPage';
import CustomersPage from './pages/CustomersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AdminShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/helper-agreements" element={<HelperAgreementsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
