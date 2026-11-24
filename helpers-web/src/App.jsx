import { Component, useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { HelperOfferOverlay } from './components/HelperOfferOverlay';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { HelperSessionProvider } from './context/HelperSessionContext';
import { usePWAInstall } from './hooks/usePWAInstall';
import { subscribeToAuthSession } from './services/helperDataService';
import {
  capturePendingWhatsAppAccountLink,
  capturePendingWhatsAppSignup,
} from './utils/whatsappLinkState';
import { mapPathnameToStepId } from './utils/onboardingSteps';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { WhatsAppLinkPage } from './pages/WhatsAppLinkPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { JobsPage } from './pages/JobsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileSectionPage } from './pages/ProfileSectionPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { PolicyPage } from './pages/PolicyPage';

const POLICY_ROUTE_KEYS = {
  '/privacy-policy': 'privacy',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/payment-pricing-policy': 'payment',
  '/refund-policy': 'refund',
  '/data-voice-policy': 'data',
};

function normalizePath(path = '/') {
  const clean = String(path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean || '/';
}

const APP_PAGE_TITLES = {
  '/': 'Home',
  '/home': 'Home',
  '/workspace': 'Home',
  '/services': 'Services',
  '/jobs': 'Jobs & Activity',
  '/payments': 'Payments',
  '/profile': 'Profile',
  '/profile/details': 'Personal details',
  '/profile/payouts': 'Payments',
  '/profile/security': 'Security & clearance',
  '/profile/legal': 'Agreement and legal',
};

function AppContent() {
  useState(() => {
    capturePendingWhatsAppSignup();
    capturePendingWhatsAppAccountLink();
    return true;
  });
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/',
  );
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [bannerNotice, setBannerNotice] = useState('');
  const [postAuthRedirect, setPostAuthRedirect] = useState('');
  const pwa = usePWAInstall();

  useEffect(() => {
    try {
      const unsub = subscribeToAuthSession(
        (sessionUser) => {
          setUser(sessionUser);
          setAuthReady(true);
        },
        (err) => {
          setAuthError(err?.message || 'Authentication error.');
          setAuthReady(true);
        },
      );
      return () => unsub?.();
    } catch (err) {
      setAuthError(err?.message || 'Authentication initialization failed.');
      setAuthReady(true);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((toPath) => {
    const raw = String(toPath || '/');
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://helpers.bakayise.com');
    const nextPath = normalizePath(url.pathname);
    const fullTarget = `${nextPath}${url.search}${url.hash}`;
    const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentFull !== fullTarget) {
      window.history.pushState(null, '', fullTarget);
    }
    setPathname(nextPath);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const isOnboardingRoute = pathname === '/onboarding' || Boolean(mapPathnameToStepId(pathname));
  const profileSectionMatch = pathname.match(/^\/profile\/(details|payouts|security|legal)$/);
  const isProtectedAppRoute =
    ['/home', '/workspace', '/services', '/jobs', '/payments', '/profile'].includes(pathname)
    || Boolean(profileSectionMatch);
  const requestMatch = pathname.match(/^\/requests\/([A-Za-z0-9_-]+)$/);

  useEffect(() => {
    if (authReady && (isOnboardingRoute || isProtectedAppRoute || requestMatch) && !user) {
      const fullIntended = typeof window !== 'undefined'
        ? `${normalizePath(window.location.pathname)}${window.location.search}${window.location.hash}`
        : pathname;
      setPostAuthRedirect(fullIntended);
      navigate('/sign-in');
    }
  }, [authReady, isOnboardingRoute, isProtectedAppRoute, pathname, requestMatch, navigate, user]);

  let content = null;

  const policyKey = POLICY_ROUTE_KEYS[pathname] || '';

  if (!authReady) {
    content = (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-sm text-ink-500">Loading Uncedo Helpers…</div>
      </div>
    );
  } else if (policyKey) {
    content = <PolicyPage policyKey={policyKey} user={user} onNavigate={navigate} />;
  } else if (pathname === '/whatsapp-link') {
    content = (
      <WhatsAppLinkPage
        user={user}
        onNavigate={navigate}
        onWhatsAppLinked={setBannerNotice}
      />
    );
  } else if (pathname === '/sign-up' || pathname === '/sign-in') {
    content = (
      <AuthPage
        initialMode={pathname === '/sign-in' ? 'signin' : 'signup'}
        user={user}
        redirectTarget={postAuthRedirect}
        onClearRedirect={() => setPostAuthRedirect('')}
        onNavigate={navigate}
        onWhatsAppLinked={setBannerNotice}
      />
    );
  } else if (pathname === '/overview' || (!user && !isOnboardingRoute && !isProtectedAppRoute && !requestMatch)) {
    content = (
      <>
        {authError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-center text-xs text-red-800">
            {authError}
          </div>
        )}
        <LandingPage user={user} onNavigate={navigate} pwa={pwa} />
      </>
    );
  } else if (user) {
    let signedInView = null;
    if (requestMatch) {
      signedInView = <RequestDetailPage requestId={requestMatch[1]} onNavigate={navigate} />;
    } else if (isOnboardingRoute) {
      signedInView = (
        <OnboardingPage
          user={user}
          pathname={pathname}
          bannerNotice={bannerNotice}
          onDismissBanner={() => setBannerNotice('')}
          onNavigate={navigate}
        />
      );
    } else if (pathname === '/services') {
      signedInView = (
        <AppShell pathname={pathname} onNavigate={navigate} pwa={pwa} title={APP_PAGE_TITLES['/services']}>
          <ServicesPage onNavigate={navigate} />
        </AppShell>
      );
    } else if (pathname === '/jobs') {
      signedInView = (
        <AppShell pathname={pathname} onNavigate={navigate} pwa={pwa} title={APP_PAGE_TITLES['/jobs']}>
          <JobsPage onNavigate={navigate} />
        </AppShell>
      );
    } else if (pathname === '/payments') {
      signedInView = (
        <AppShell pathname={pathname} onNavigate={navigate} pwa={pwa} title={APP_PAGE_TITLES['/payments']}>
          <ProfileSectionPage section="payouts" isTopLevel onNavigate={navigate} />
        </AppShell>
      );
    } else if (profileSectionMatch) {
      const section = profileSectionMatch[1];
      signedInView = (
        <AppShell
          pathname={pathname}
          onNavigate={navigate}
          pwa={pwa}
          title={APP_PAGE_TITLES[pathname] || 'Profile'}
        >
          <ProfileSectionPage section={section} onNavigate={navigate} />
        </AppShell>
      );
    } else if (pathname === '/profile') {
      signedInView = (
        <AppShell pathname={pathname} onNavigate={navigate} pwa={pwa} title={APP_PAGE_TITLES['/profile']}>
          <ProfilePage onNavigate={navigate} pwa={pwa} />
        </AppShell>
      );
    } else {
      signedInView = (
        <AppShell pathname={pathname} onNavigate={navigate} pwa={pwa} title={APP_PAGE_TITLES['/home']}>
          <HomePage onNavigate={navigate} />
        </AppShell>
      );
    }

    content = (
      <HelperSessionProvider user={user}>
        {signedInView}
        <HelperOfferOverlay onNavigate={navigate} />
      </HelperSessionProvider>
    );
  }

  return (
    <>
      <OfflineIndicator />
      {content}
      <PWAInstallPrompt
        isInstalled={pwa.isInstalled}
        isIOS={pwa.isIOS}
        hasNativePrompt={pwa.hasNativePrompt}
        popupOpen={pwa.popupOpen}
        showInstructions={pwa.showInstructions}
        onInstall={pwa.promptInstall}
        onDismiss={pwa.dismissPopup}
      />
    </>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 text-center space-y-3 shadow-sm">
            <h1 className="font-display text-lg font-bold text-ink-900">Unable to load Uncedo Helpers</h1>
            <p className="text-sm text-ink-600">
              {this.state.error?.message || 'An unexpected error occurred while starting the app.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl bg-tealbrand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-tealbrand-800"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
