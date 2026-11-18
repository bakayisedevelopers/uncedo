import { useCallback, useEffect, useState } from 'react';
import { subscribeToAuthSession } from './services/helperDataService';
import { mapPathnameToStepId } from './utils/onboardingSteps';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { WhatsAppLinkPage } from './pages/WhatsAppLinkPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { RequestDetailPage } from './pages/RequestDetailPage';

function normalizePath(path = '/') {
  const clean = String(path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean || '/';
}

export default function App() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/',
  );
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [bannerNotice, setBannerNotice] = useState('');

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((toPath) => {
    const next = normalizePath(toPath);
    if (window.location.pathname !== next) {
      window.history.pushState(null, '', next);
    }
    setPathname(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const isOnboardingRoute = pathname === '/onboarding' || Boolean(mapPathnameToStepId(pathname));
  const requestMatch = pathname.match(/^\/requests\/([A-Za-z0-9_-]+)$/);

  useEffect(() => {
    if (authReady && (isOnboardingRoute || pathname === '/workspace' || requestMatch) && !user) {
      navigate('/sign-in');
    }
  }, [authReady, isOnboardingRoute, pathname, requestMatch, navigate, user]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-sm text-ink-500">Loading Uncedo Helpers…</div>
      </div>
    );
  }

  if (pathname === '/workspace' && user) {
    return <WorkspacePage user={user} onNavigate={navigate} />;
  }

  if (requestMatch && user) {
    return <RequestDetailPage user={user} requestId={requestMatch[1]} onNavigate={navigate} />;
  }

  if (pathname === '/whatsapp-link') {
    return (
      <WhatsAppLinkPage
        user={user}
        onNavigate={navigate}
        onWhatsAppLinked={setBannerNotice}
      />
    );
  }

  if (pathname === '/sign-up' || pathname === '/sign-in') {
    return (
      <AuthPage
        initialMode={pathname === '/sign-in' ? 'signin' : 'signup'}
        user={user}
        onNavigate={navigate}
        onWhatsAppLinked={setBannerNotice}
      />
    );
  }

  if (isOnboardingRoute && user) {
    return (
      <OnboardingPage
        user={user}
        pathname={pathname}
        bannerNotice={bannerNotice}
        onDismissBanner={() => setBannerNotice('')}
        onNavigate={navigate}
      />
    );
  }

  return (
    <>
      {authError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-center text-xs text-red-800">
          {authError}
        </div>
      )}
      <LandingPage user={user} onNavigate={navigate} />
    </>
  );
}
