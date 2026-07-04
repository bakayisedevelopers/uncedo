import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { hasFirebaseEnv, missingFirebaseEnvKeys } from '../firebase/config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, setRememberMePreference } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      setIsSubmitting(true);
      setRememberMePreference(rememberMe);
      await login({ email, password, rememberMe });
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-dashboard-radial px-4 py-10">
      <div className="absolute inset-0">
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-white/10 bg-ink-900/80 p-8 shadow-glow backdrop-blur sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-brand-soft">
            <Building2 className="h-3.5 w-3.5" />
            Uncedo Admin
          </div>
          <h1 className="mt-5 max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Review helpers, customers, and service photos from one console.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-ink-200 sm:text-base">
            Approve or suspend helper services, inspect uploaded work pictures, and keep customer records visible for
            operations and support.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['Helper moderation', 'Approve or suspend helpers.'],
              ['Service control', 'Review individual skill photos.'],
              ['Customer insight', 'See profile and location data.'],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-200">{copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-white">Sign in</h2>
          <p className="mt-2 text-sm text-ink-200">Use your admin-enabled Firebase account.</p>

          {!hasFirebaseEnv ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Missing Firebase environment variables: {missingFirebaseEnvKeys.join(', ')}.
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-white">Email address</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-ink-950/60 py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="admin@company.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-white">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-ink-950/60 py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="Password"
                />
              </div>
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent text-brand focus:ring-brand"
              />
              Remember this device
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3.5 text-sm font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in...' : 'Open admin console'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
