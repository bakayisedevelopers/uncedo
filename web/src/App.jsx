import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import AuthPage from './pages/AuthPage';
import CustomerAccountPage from './pages/CustomerAccountPage';
import PaymentPage from './pages/PaymentPage';
import WhatsAppAccountLinkPage from './pages/WhatsAppAccountLinkPage';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in" element={<AuthPage mode="login" />} />
          <Route path="/sign-up" element={<AuthPage mode="signup" />} />
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/whatsapp-link" element={<WhatsAppAccountLinkPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
