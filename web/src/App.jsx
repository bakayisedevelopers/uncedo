import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HelpersLandingPage from './pages/HelpersLandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AppShell from './layouts/AppShell';
import ProtectedRoute from './components/app/ProtectedRoute';
import AppHomeRedirect from './pages/app/AppHomeRedirect';
import StudentDashboardPage from './pages/app/student/StudentDashboardPage';
import RequestClassPage from './pages/app/student/RequestClassPage';
import StudentSessionsPage from './pages/app/student/StudentSessionsPage';
import StudentWalletPage from './pages/app/student/StudentWalletPage';
import StudentRequestStatusPage from './pages/app/student/StudentRequestStatusPage';
import TutorDashboardPage from './pages/app/tutor/TutorDashboardPage';
import AvailableRequestsPage from './pages/app/tutor/AvailableRequestsPage';
import MyClassesPage from './pages/app/tutor/MyClassesPage';
import TutorSessionsPage from './pages/app/tutor/TutorSessionsPage';
import TutorPaymentsPage from './pages/app/tutor/TutorPaymentsPage';
import TutorAgreementPage from './pages/app/tutor/TutorAgreementPage';
import ProfilePage from './pages/app/ProfilePage';
import NotificationsPage from './pages/app/NotificationsPage';
import OnboardingPage from './pages/app/OnboardingPage';
import SessionRoomPage from './pages/app/SessionRoomPage';
import AdminDashboardPage from './pages/app/admin/AdminDashboardPage';
import AdminTutorsPage from './pages/app/admin/AdminTutorsPage';
import AdminTutorAgreementsPage from './pages/app/admin/AdminTutorAgreementsPage';
import AdminPaymentsPage from './pages/app/admin/AdminPaymentsPage';
import AdminUnsupportedSubjectsPage from './pages/app/admin/AdminUnsupportedSubjectsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import PaymentPricingPolicyPage from './pages/PaymentPricingPolicyPage';
import DataVoicePolicyPage from './pages/DataVoicePolicyPage';
import AboutPage from './pages/AboutPage';
import StudentRequestsPage from './pages/app/student/StudentRequestsPage';
import StudentRequestDetailsPage from './pages/app/student/StudentRequestDetailsPage';

export default function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/uncedo" element={<LandingPage />} />
        <Route path="/helpers" element={<HelpersLandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/payment-pricing-policy" element={<PaymentPricingPolicyPage />} />
        <Route path="/data-voice-policy" element={<DataVoicePolicyPage />} />
        <Route path="/about" element={<AboutPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<AppHomeRedirect />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="session/:id" element={<SessionRoomPage />} />

          <Route
            path="student"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/request"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentRequestStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/request/:requestId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentRequestStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/request-class"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RequestClassPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/sessions"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentSessionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/payment"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentWalletPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/requests"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentRequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="student/requests/:requestId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentRequestDetailsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="tutor"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/available-requests"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <AvailableRequestsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/my-classes"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <MyClassesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/sessions"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorSessionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/payments"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tutor/agreement"
            element={
              <ProtectedRoute allowedRoles={['tutor']}>
                <TutorAgreementPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/tutors"
            element={
              <ProtectedRoute requireAdmin>
                <AdminTutorsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/tutor-agreements"
            element={
              <ProtectedRoute requireAdmin>
                <AdminTutorAgreementsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/payments"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/requested-subjects"
            element={
              <ProtectedRoute requireAdmin>
                <AdminUnsupportedSubjectsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
