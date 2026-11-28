import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import HomeReelsPage from './pages/HomeReelsPage';
import LandingPage from './pages/LandingPage';
import PoliciesPage from './pages/PoliciesPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import PaymentPricingPolicyPage from './pages/PaymentPricingPolicyPage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import DataVoicePolicyPage from './pages/DataVoicePolicyPage';
import AuthPage from './pages/AuthPage';
import CustomerAccountPage from './pages/CustomerAccountPage';
import PaymentPage from './pages/PaymentPage';
import BrowseServicesPage from './pages/BrowseServicesPage';
import WhatsAppAccountLinkPage from './pages/WhatsAppAccountLinkPage';
import WhatsAppAccountDeletionPage from './pages/WhatsAppAccountDeletionPage';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<HomeReelsPage />} />
          <Route path="/about" element={<LandingPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/services" element={<BrowseServicesPage />} />
          <Route path="/browse" element={<Navigate to="/services" replace />} />
          <Route path="/sign-in" element={<AuthPage mode="login" />} />
          <Route path="/sign-up" element={<AuthPage mode="signup" />} />
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/whatsapp-link" element={<WhatsAppAccountLinkPage />} />
          <Route path="/delete-account" element={<WhatsAppAccountDeletionPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/payment-pricing-policy" element={<PaymentPricingPolicyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/data-voice-policy" element={<DataVoicePolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
