import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthMessage } from '../components/AuthMessage';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { googleAuthEnabled, whatsappAuthEnabled } from '../firebase/config';
import { completeWhatsAppSignupLink } from '../services/authService';

export default function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    authError,
    clearAuthError,
    initializing,
    user,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
    requestWhatsAppAuthCode,
    verifyWhatsAppAuthCode,
  } = useAuth();
  const isSignup = mode === 'signup';
  const [method, setMethod] = useState('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [signupLink, setSignupLink] = useState(null);
  const [signupLinkLoaded, setSignupLinkLoaded] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkPromiseRef = useRef(null);
  const autoLinkAttemptedTokenRef = useRef('');

  useEffect(() => {
    const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const token = String(params.get('wa_signup_token') || '').trim();
    const role = String(params.get('wa_role') || '').trim().toLowerCase();
    const phone = String(params.get('wa_phone') || '').trim();
    const fromNavigation = location.state?.whatsappSignupLink || null;
    const link = /^[A-Za-z0-9_-]{40,60}$/.test(token)
      ? { token, role: ['customer', 'helper'].includes(role) ? role : '', phone }
      : fromNavigation;
    if (token) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    setSignupLink(link);
    setSignupLinkLoaded(true);
  }, [location.key, location.state]);

  async function finishWhatsAppLink() {
    if (!signupLink?.token) return null;
    if (linkPromiseRef.current) return linkPromiseRef.current;
    setLinking(true);
    const promise = completeWhatsAppSignupLink({ token: signupLink.token });
    linkPromiseRef.current = promise;
    try {
      const result = await promise;
      setSignupLink(null);
      setMessage('Your Uncedo account is linked to this WhatsApp number. Returning to your chat…');
      const returnUrl = String(result.returnUrl || '');
      if (/^https:\/\/wa\.me\/\d{8,15}$/.test(returnUrl)) window.location.assign(returnUrl);
      else navigate('/account', { replace: true });
      return result;
    } catch (nextError) {
      setError(`You are signed in, but this WhatsApp number was not linked. ${nextError?.message || 'Please retry or contact Uncedo support.'}`);
      throw nextError;
    } finally {
      linkPromiseRef.current = null;
      setLinking(false);
    }
  }

  useEffect(() => {
    if (!signupLinkLoaded || !user || !signupLink?.token || linking) return;
    if (autoLinkAttemptedTokenRef.current === signupLink.token) return;
    autoLinkAttemptedTokenRef.current = signupLink.token;
    finishWhatsAppLink().catch(() => null);
  }, [signupLinkLoaded, user?.uid, signupLink?.token, linking]);

  if (!initializing && user && signupLinkLoaded && !signupLink?.token) return <Navigate to="/account" replace />;

  async function run(action) {
    setBusy(true);
    setError('');
    setMessage('');
    clearAuthError();
    try {
      await action();
      if (signupLink?.token) {
        await finishWhatsAppLink();
      } else {
        navigate('/account', { replace: true });
      }
    } catch (nextError) {
      setError(nextError?.message || 'Unable to continue. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event) {
    event.preventDefault();
    if (isSignup) {
      await run(() => signUpWithEmail({ name, email, password }));
    } else {
      await run(() => signInWithEmail({ email, password }));
    }
  }

  async function beginWhatsApp(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestWhatsAppAuthCode({
        phoneNumber,
        mode: isSignup ? 'signup' : 'login',
        name,
        email,
      });
      setChallengeId(String(result?.challengeId || ''));
      setMessage('If this number can sign in or register, a verification code has been sent on WhatsApp.');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to request a WhatsApp code.');
    } finally {
      setBusy(false);
    }
  }

  async function finishWhatsApp(event) {
    event.preventDefault();
    await run(() => verifyWhatsAppAuthCode({ challengeId, code }));
  }

  const title = isSignup ? 'Create your Uncedo account' : 'Welcome back';

  return (
    <MainLayout>
      <main className="mx-auto grid min-h-[75vh] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Customer account</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-4 max-w-xl text-zinc-600">
            Sign in with your Uncedo account. If you opened a WhatsApp setup link, authenticate with your email account to connect that chat to your profile.
          </p>
          <ul className="mt-7 space-y-3 text-sm text-zinc-700">
            <li>• Your account and profile are saved under your Firebase identity.</li>
            <li>• Complete your customer details after signing in.</li>
            <li>• Existing customer payment setup remains in the Uncedo app.</li>
          </ul>
        </section>

        <section className="app-surface p-6 sm:p-8">
          <div className="mb-6 flex gap-2 rounded-2xl bg-zinc-100 p-1">
            <button type="button" onClick={() => { setMethod('email'); setError(''); setMessage(''); }} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${method === 'email' ? 'bg-white text-brand shadow-sm' : 'text-zinc-500'}`}>Email</button>
            <button type="button" onClick={() => { setMethod('whatsapp'); setError(''); setMessage(''); }} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${method === 'whatsapp' ? 'bg-white text-brand shadow-sm' : 'text-zinc-500'}`}>WhatsApp</button>
          </div>

          <AuthMessage text={error || authError} />
          <AuthMessage text={message} tone="info" />
          {signupLink?.token ? (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-bold">Connect your WhatsApp chat</p>
              <p className="mt-1">{signupLink.role === 'helper' ? 'Helper' : 'Customer'} account · WhatsApp number {signupLink.phone || 'will be verified by the secure link'}.</p>
              <p className="mt-1">Your email remains your sign-in method. The number is attached only after you sign in or create the matching account.</p>
            </div>
          ) : null}
          {error && signupLink?.token && user ? (
            <button type="button" disabled={linking} onClick={() => finishWhatsAppLink().catch(() => null)} className="mb-5 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-800 disabled:opacity-60">
              {linking ? 'Linking WhatsApp…' : 'Retry WhatsApp link'}
            </button>
          ) : null}

          {method === 'email' ? (
            <form onSubmit={submitEmail} className="space-y-4">
              {isSignup ? <Field label="Full name" value={name} onChange={setName} autoComplete="name" required /> : null}
              {signupLink?.phone ? <Field label="WhatsApp number to link" value={signupLink.phone} onChange={() => {}} type="tel" autoComplete="tel" disabled /> : null}
              <Field label="Email address" value={email} onChange={setEmail} type="email" autoComplete="email" required />
              <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} required minLength={6} />
              <button disabled={busy} className="w-full rounded-2xl bg-brand px-5 py-3 font-bold text-white transition hover:bg-brand-dark disabled:opacity-60">
                {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={challengeId ? finishWhatsApp : beginWhatsApp} className="space-y-4">
              {isSignup ? <Field label="Full name" value={name} onChange={setName} autoComplete="name" required /> : null}
              {isSignup ? <Field label="Real email address" value={email} onChange={setEmail} type="email" autoComplete="email" required /> : null}
              <Field label="WhatsApp number" value={phoneNumber} onChange={setPhoneNumber} type="tel" autoComplete="tel" placeholder="+27 71 234 5678" required disabled={Boolean(challengeId)} />
              {challengeId ? <Field label="Verification code" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required /> : null}
              {!whatsappAuthEnabled ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">WhatsApp sign-in is awaiting Meta authentication configuration.</p> : null}
              <button disabled={busy || !whatsappAuthEnabled} className="w-full rounded-2xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">
                {busy ? 'Please wait…' : challengeId ? 'Verify and continue' : 'Send WhatsApp code'}
              </button>
              {challengeId ? <button type="button" onClick={() => { setChallengeId(''); setCode(''); setMessage(''); }} className="w-full text-sm font-semibold text-zinc-500">Use a different number</button> : null}
            </form>
          )}

          <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or<span className="h-px flex-1 bg-zinc-200" /></div>
          <button type="button" disabled={busy || !googleAuthEnabled} onClick={() => run(signInWithGoogle)} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-bold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60">
            <GoogleMark /> Continue with Google
          </button>
          {!googleAuthEnabled ? <p className="text-center text-xs text-zinc-500">Google sign-in is awaiting Firebase OAuth provider setup.</p> : null}
          <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
            By continuing, you agree to Uncedo’s <Link className="font-semibold underline" to="/terms">Terms of Service</Link> and <Link className="font-semibold underline" to="/privacy-policy">Privacy Policy</Link>.
          </p>
          <p className="mt-6 text-center text-sm text-zinc-600">
            {isSignup ? 'Already registered?' : 'New to Uncedo?'}{' '}
            <Link
              className="font-bold text-brand underline"
              to={isSignup ? '/sign-in' : '/sign-up'}
              state={signupLink?.token ? { whatsappSignupLink: signupLink } : undefined}
            >{isSignup ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </section>
      </main>
    </MainLayout>
  );
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-zinc-700">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-zinc-100" {...props} />
    </label>
  );
}

function GoogleMark() {
  return <span aria-hidden="true" className="text-xl font-black text-[#4285f4]">G</span>;
}
