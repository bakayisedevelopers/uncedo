import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Mail, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { LegalLinksInline } from '../components/legal/LegalLinks';

function Button({ type = 'button', children, className = '', ...props }) {
  return (
    <button
      type={type}
      className={`w-full rounded-2xl bg-brand px-4 py-3 font-bold text-white transition-colors hover:bg-brand-dark ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setRememberMePreference } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setIsSubmitting(true);
      setRememberMePreference(rememberMe);
      const user = await login({ email, password });
      const fallbackPath = String(user?.activeRole || user?.role || 'student').toLowerCase() === 'tutor' ? '/app/tutor' : '/app/student';
      navigate(location.state?.from || fallbackPath);
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-zinc-100 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-zinc-600 transition-colors hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
        <h2 className="text-center text-4xl font-black tracking-tight text-zinc-900">Welcome back</h2>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Don't have an account?{' '}
          <Link to="/signup" className="font-bold text-brand hover:underline">
            Sign up for free
          </Link>
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-4 mt-8 sm:mx-6 sm:w-full sm:max-w-md md:mx-auto">
        <div className="rounded-[32px] border border-brand/20 bg-white py-10 px-6 shadow-xl sm:px-12">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-bold text-zinc-900">
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Mail className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-2xl border border-zinc-300 bg-zinc-50 py-3 pl-11 pr-4 text-zinc-900 placeholder-zinc-400 transition-all focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-bold text-zinc-900">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Lock className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-2xl border border-zinc-300 bg-zinc-50 py-3 pl-11 pr-4 text-zinc-900 placeholder-zinc-400 transition-all focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-brand focus:ring-brand"
                />
                Remember me
              </label>
              <a href="#" className="text-sm font-bold text-brand hover:underline">
                Forgot password?
              </a>
            </div>

            <p className="rounded-2xl border border-brand/20 bg-brand/5 p-3 text-xs text-zinc-700">
              By signing in, you agree to Parakleo&apos;s{' '}
              <LegalLinksInline />
            </p>

            {error ? <p className="text-sm text-rose-500">{error}</p> : null}

            <Button type="submit" className="w-full py-4 text-lg" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
