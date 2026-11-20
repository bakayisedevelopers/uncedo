import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import portraitImg from '../assets/images/auth_partner_portrait_1794749286443.jpg';
import {
  WHATSAPP_CHAT_URL,
  completeWhatsAppSignupLink,
  inspectWhatsAppSignupLink,
  resendWhatsAppSignupLink,
  signInHelperAccount,
  signOutHelperAccount,
  signUpHelperAccount,
} from '../services/helperDataService';
import {
  capturePendingWhatsAppSignup,
  clearPendingWhatsAppSignup,
} from '../utils/whatsappLinkState';

export function AuthPage({
  initialMode = 'signup',
  user,
  redirectTarget = '',
  onClearRedirect,
  onNavigate,
  onWhatsAppLinked,
}) {
  const [hashInfo, setHashInfo] = useState(() => capturePendingWhatsAppSignup());
  const [mode, setMode] = useState(() => {
    if (hashInfo.mode === 'signin') return 'signin';
    if (hashInfo.mode === 'signup') return 'signup';
    return initialMode;
  });

  useEffect(() => {
    const latest = capturePendingWhatsAppSignup();
    if (latest.token && latest.token !== hashInfo.token) {
      setHashInfo(latest);
      if (latest.phone) setPhoneNumber(latest.phone);
      if (latest.mode === 'signin' || latest.mode === 'signup') {
        setMode(latest.mode);
      }
      setLinkExpired(false);
      setConflictAccount(null);
      setInspection(null);
      setError('');
    }
  }, [hashInfo.token]);

  useEffect(() => {
    if (!hashInfo.mode) {
      setMode(initialMode);
    }
  }, [initialMode, hashInfo.mode]);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(hashInfo.phone || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [linkExpired, setLinkExpired] = useState(false);
  const [resendingLink, setResendingLink] = useState(false);
  const [resendState, setResendState] = useState('idle');
  const [resendMessage, setResendMessage] = useState('');
  const [resendChatUrl, setResendChatUrl] = useState(WHATSAPP_CHAT_URL);
  const [inspection, setInspection] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [conflictAccount, setConflictAccount] = useState(null);
  const [portraitLoaded, setPortraitLoaded] = useState(true);
  const linkingFromSubmitRef = useRef(false);
  const completedLinkRef = useRef(false);

  const isExpiredLinkError = (err) => {
    const code = String(err?.code || '').toLowerCase();
    const message = String(err?.message || '');
    return code.includes('deadline-exceeded') || /expired|no longer available/i.test(message);
  };

  const isAccountConflictError = (err) => {
    const code = String(err?.code || '').toLowerCase();
    const conflictCode = String(err?.details?.conflictCode || '').toLowerCase();
    const message = String(err?.message || '');
    return (
      ['account-linked-elsewhere', 'account-whatsapp-already-set'].includes(conflictCode)
      || (code.includes('already-exists') && /already linked to another whatsapp|different whatsapp|already has a different whatsapp/i.test(message))
    );
  };

  const isIdentityConflictError = (err) => {
    const code = String(err?.code || '').toLowerCase();
    const conflictCode = String(err?.details?.conflictCode || '').toLowerCase();
    const message = String(err?.message || '');
    return (
      ['identity-linked-elsewhere', 'whatsapp-number-linked-elsewhere', 'guest-history-linked-elsewhere'].includes(conflictCode)
      || (code.includes('already-exists') && /whatsapp number is (already )?linked|whatsapp chat is still linked|conversation history is linked/i.test(message))
    );
  };

  useEffect(() => {
    if (user && !hashInfo.token && !completedLinkRef.current) {
      const target = redirectTarget || (mode === 'signup' ? '/onboarding' : '/home');
      if (redirectTarget) onClearRedirect?.();
      onNavigate(target);
    }
  }, [hashInfo.token, mode, onClearRedirect, onNavigate, redirectTarget, user]);

  useEffect(() => {
    if (!hashInfo.token || linkingFromSubmitRef.current) return;
    let active = true;
    setInspecting(true);
    inspectWhatsAppSignupLink(hashInfo.token)
      .then((res) => {
        if (!active || linkingFromSubmitRef.current) return;
        setInspection(res);
        if (res?.phoneNumber) {
          setPhoneNumber((prev) => prev || res.phoneNumber);
        }
        if (res?.status === 'expired' || res?.status === 'invalid' || res?.status === 'used') {
          setLinkExpired(true);
          setConflictAccount(null);
          setError(
            res.status === 'used'
              ? 'This WhatsApp signup link has already been used. Request a fresh link if you still need to link.'
              : 'The WhatsApp signup link has expired. Send a new link to your WhatsApp chat below.',
          );
          return;
        }
        if (res?.status === 'account-linked-elsewhere') {
          setConflictAccount({
            type: 'account-linked-elsewhere',
            name: res.accountName || user?.displayName || user?.profile?.fullName || '',
            email: res.accountEmail || user?.email || '',
            currentLinkedPhone: res.currentLinkedPhone || '',
            message: 'This account is already linked to another WhatsApp number. Would you like to log out of this account and sign in to the account you want to link?',
          });
          return;
        }
        if (res?.status === 'identity-linked-elsewhere') {
          setConflictAccount({
            type: 'identity-linked-elsewhere',
            name: res.accountName || user?.displayName || user?.profile?.fullName || '',
            email: res.accountEmail || user?.email || '',
            currentLinkedPhone: '',
            message: 'This WhatsApp number is already linked to another Uncedo account. Log out and sign in with that account, or contact support if you need to change it.',
          });
          return;
        }
        if (res?.status === 'role-mismatch') {
          setConflictAccount({
            type: 'role-mismatch',
            name: res.accountName || user?.displayName || user?.profile?.fullName || '',
            email: res.accountEmail || user?.email || '',
            currentLinkedPhone: '',
            message: 'This signed-in account is registered as a customer account. Log out and sign in or create a helper account to link your WhatsApp chat.',
          });
          return;
        }
        setConflictAccount(null);
      })
      .catch(() => {
        // Preflight failures fall back gracefully to existing interactive verification.
      })
      .finally(() => {
        if (active) setInspecting(false);
      });
    return () => { active = false; };
  }, [hashInfo.token, user?.displayName, user?.email, user?.profile?.fullName, user?.uid]);

  const finishSuccessfulLink = (linkResult, noticeText) => {
    completedLinkRef.current = true;
    clearPendingWhatsAppSignup();
    setHashInfo({ token: '', phone: '', mode: '' });
    onWhatsAppLinked?.(noticeText || (
      linkResult?.confirmationSent
        ? 'WhatsApp chat linked to your helper account. Confirmation sent to your WhatsApp.'
        : 'WhatsApp chat linked to your helper account. Complete the steps below to get verified.'
    ));
    if (redirectTarget) onClearRedirect?.();
    onNavigate('/onboarding');
  };

  const handleSwitchAccount = async () => {
    setError('');
    setConflictAccount(null);
    setInspection(null);
    setSubmitting(true);
    try {
      await signOutHelperAccount();
      setMode('signin');
    } catch (err) {
      setError(err?.message || 'Unable to sign out right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setConflictAccount(null);
    setSubmitting(true);
    linkingFromSubmitRef.current = Boolean(hashInfo.token);
    const activePhone = phoneNumber || hashInfo.phone || inspection?.phoneNumber || '';
    let signedInUser = null;
    try {
      if (mode === 'signup') {
        signedInUser = await signUpHelperAccount({ fullName, email, password, phoneNumber: activePhone });
      } else {
        signedInUser = await signInHelperAccount({ email, password });
      }

      if (hashInfo.token) {
        const result = await completeWhatsAppSignupLink(hashInfo.token);
        finishSuccessfulLink(
          result,
          mode === 'signup'
            ? 'Helper account created and linked to WhatsApp. A confirmation notification has been sent to your WhatsApp chat.'
            : 'Helper account signed in and linked to WhatsApp. A confirmation notification has been sent to your WhatsApp chat.',
        );
        return;
      }

      if (mode === 'signup') {
        onWhatsAppLinked?.('Your helper account has been created. Complete the 7 onboarding steps below.');
      }
      const target = redirectTarget || (mode === 'signup' ? '/onboarding' : '/home');
      if (redirectTarget) onClearRedirect?.();
      onNavigate(target);
    } catch (err) {
      if (hashInfo.token && isAccountConflictError(err)) {
        setConflictAccount({
          type: 'account-linked-elsewhere',
          name: signedInUser?.displayName || fullName || user?.displayName || '',
          email: signedInUser?.email || email || user?.email || '',
          currentLinkedPhone: '',
          message: 'This account is already linked to another WhatsApp number. Would you like to log out of this account and sign in to the account you want to link?',
        });
      } else if (hashInfo.token && isIdentityConflictError(err)) {
        setConflictAccount({
          type: 'identity-linked-elsewhere',
          name: signedInUser?.displayName || fullName || user?.displayName || '',
          email: signedInUser?.email || email || user?.email || '',
          currentLinkedPhone: '',
          message: err?.message || 'This WhatsApp number is already linked to another Uncedo account.',
        });
      } else if (hashInfo.token && isExpiredLinkError(err)) {
        setLinkExpired(true);
        setError(err?.message || 'The WhatsApp signup link has expired.');
      } else {
        setError(err?.message || 'Unable to authenticate right now. Please check your details and try again.');
      }
    } finally {
      linkingFromSubmitRef.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmLinkCurrentSession = async () => {
    if (!hashInfo.token) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await completeWhatsAppSignupLink(hashInfo.token);
      finishSuccessfulLink(
        result,
        result?.confirmationSent
          ? 'WhatsApp chat linked to your helper account. A confirmation message has been sent to your WhatsApp chat.'
          : 'WhatsApp chat linked to your helper account. Continue your onboarding below.',
      );
    } catch (err) {
      if (isAccountConflictError(err)) {
        setConflictAccount({
          type: 'account-linked-elsewhere',
          name: inspection?.accountName || user?.displayName || user?.profile?.fullName || '',
          email: inspection?.accountEmail || user?.email || '',
          currentLinkedPhone: '',
          message: 'This account is already linked to another WhatsApp number. Would you like to log out of this account and sign in to the account you want to link?',
        });
      } else if (isIdentityConflictError(err)) {
        setConflictAccount({
          type: 'identity-linked-elsewhere',
          name: inspection?.accountName || user?.displayName || user?.profile?.fullName || '',
          email: inspection?.accountEmail || user?.email || '',
          currentLinkedPhone: '',
          message: err?.message || 'This WhatsApp number is already linked to another Uncedo account.',
        });
      } else if (isExpiredLinkError(err)) {
        setLinkExpired(true);
        setError(err?.message || 'The WhatsApp signup link has expired.');
      } else {
        setError(err?.message || 'Unable to link this WhatsApp session. Log out and sign in with the helper account you want to link.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendLinkToWhatsApp = async () => {
    if (!hashInfo.token || resendingLink) return;
    setResendingLink(true);
    setResendMessage('');
    try {
      const result = await resendWhatsAppSignupLink(hashInfo.token);
      const baseChatUrl = result?.returnUrl || WHATSAPP_CHAT_URL;
      setResendChatUrl(baseChatUrl);
      if (result?.sent) {
        setResendState('sent');
        setResendMessage(
          `A fresh link has been sent to your WhatsApp chat${displayPhone ? ` (${displayPhone})` : ''}. Open WhatsApp and tap the latest link.`,
        );
      } else {
        setResendState('window-closed');
        setResendMessage(
          'Your WhatsApp 24-hour reply window needs a message first. Tap below to send "Resend link" in WhatsApp.',
        );
      }
    } catch (err) {
      setResendState('error');
      setResendMessage(err?.message || 'Could not send a new link automatically. Tap below to request a new link in WhatsApp.');
    } finally {
      setResendingLink(false);
    }
  };

  const displayPhone = phoneNumber || hashInfo.phone || inspection?.phoneNumber || '';
  const authenticatedName =
    conflictAccount?.name
    || inspection?.accountName
    || user?.displayName
    || user?.profile?.fullName
    || 'Helper account';
  const authenticatedEmail =
    conflictAccount?.email
    || inspection?.accountEmail
    || user?.email
    || '';

  return (
    <div className="min-h-screen bg-canvas grid grid-cols-1 lg:grid-cols-12">
      {/* Left Architectural Editorial Panel */}
      <aside className="hidden lg:flex lg:col-span-5 relative bg-forest-900 text-white flex-col justify-between p-10 overflow-hidden">
        {portraitLoaded && (
          <img
            src={portraitImg}
            alt="Uncedo helper partner holding smartphone"
            referrerPolicy="no-referrer"
            onError={() => setPortraitLoaded(false)}
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-900/80 to-forest-900/60" />

        <div className="relative z-10 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center gap-2.5 font-display font-bold text-lg tracking-tight text-white whitespace-nowrap"
          >
            <img
              src="/helpers-logo-192.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg border border-white/20 object-cover bg-white shrink-0"
            />
            <span>Uncedo Helpers</span>
          </a>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-500">
              Web Onboarding Portal
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white leading-tight">
              Your complete helper setup, guided step by step.
            </h2>
          </div>

          <ul className="space-y-3 text-sm text-white/85 border-t border-white/15 pt-5">
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Links automatically to your WhatsApp helper profile</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Tracks all 7 steps from selfie and portfolio to bank payout setup</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-tealbrand-500 mt-0.5 shrink-0" />
              <span>Saves progress automatically so you can resume anytime</span>
            </li>
          </ul>
        </div>
      </aside>

      {/* Right Form Canvas */}
      <div className="lg:col-span-7 flex flex-col bg-surface">
        <header className="border-b border-border px-6 sm:px-10 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900 whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </button>
          <span className="lg:hidden inline-flex items-center gap-2 font-display font-bold text-sm text-ink-900">
            <img
              src="/helpers-logo-192.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-md border border-border object-cover bg-white shrink-0"
            />
            <span>Uncedo Helpers</span>
          </span>
          <div className="w-20 hidden lg:block" />
        </header>

        <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tealbrand-700">
                {user && hashInfo.token
                  ? 'WhatsApp Account Linking'
                  : mode === 'signup'
                    ? 'New Partner Registration'
                    : 'Returning Partner'}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
                {user && hashInfo.token
                  ? (conflictAccount
                    ? 'Account conflict detected'
                    : linkExpired
                      ? 'WhatsApp link expired'
                      : inspection?.status === 'already-linked-to-you'
                        ? 'WhatsApp already linked'
                        : 'Confirm account to link')
                  : (mode === 'signup' ? 'Create your helper account' : 'Sign in to your account')}
              </h1>
              <p className="text-sm text-ink-500 leading-relaxed">
                {hashInfo.token
                  ? (user
                    ? 'Review the signed-in helper account details below before connecting your WhatsApp chat.'
                    : 'Sign in or create your helper account. Your WhatsApp number is prefilled and will link automatically right after login.')
                  : 'Access your checklist, upload work photos or clearance documents, and check approval status.'}
              </p>
            </div>

            {!user && (
              <div className="grid grid-cols-2 p-1 rounded-lg bg-well border border-border">
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('signup'); }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'signup'
                      ? 'bg-surface text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setMode('signin'); }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'signin'
                      ? 'bg-surface text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  Sign In
                </button>
              </div>
            )}

            {hashInfo.token && (
              <div className={`rounded-lg border px-4 py-3 text-xs flex items-center gap-2.5 ${
                linkExpired
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : conflictAccount
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-tealbrand-600/30 bg-tealbrand-50 text-tealbrand-700'
              }`}>
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>
                  {linkExpired
                    ? `WhatsApp link${displayPhone ? ` for ${displayPhone}` : ''} has expired.`
                    : `WhatsApp link token active${displayPhone ? ` for ${displayPhone}` : ''}.`}
                </span>
              </div>
            )}

            {user && hashInfo.token ? (
              <div className="space-y-4">
                {inspecting && !conflictAccount && !linkExpired && !inspection ? (
                  <div className="rounded-xl border border-border bg-well/60 p-5 text-sm text-ink-600">
                    Checking your signed-in account and WhatsApp link status…
                  </div>
                ) : conflictAccount ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2.5">
                      <div className="flex items-start gap-2.5 text-red-900">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-semibold text-sm">
                            {conflictAccount.type === 'account-linked-elsewhere'
                              ? 'Account already linked to another WhatsApp number'
                              : conflictAccount.type === 'role-mismatch'
                                ? 'Customer account signed in'
                                : 'WhatsApp number already linked'}
                          </div>
                          <p className="text-sm text-red-800 leading-relaxed">
                            {conflictAccount.message}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-red-200/80 bg-white/80 p-3 text-xs space-y-1 text-ink-800">
                        <div>
                          <span className="text-ink-500">Signed in as:</span>{' '}
                          <span className="font-semibold text-ink-900">{authenticatedName}</span>
                        </div>
                        {authenticatedEmail && (
                          <div>
                            <span className="text-ink-500">Email:</span>{' '}
                            <span className="font-medium text-ink-900">{authenticatedEmail}</span>
                          </div>
                        )}
                        {conflictAccount.currentLinkedPhone && (
                          <div>
                            <span className="text-ink-500">Currently linked WhatsApp:</span>{' '}
                            <span className="font-mono font-medium text-ink-900">{conflictAccount.currentLinkedPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      <LogOut className="h-4 w-4" />
                      {submitting ? 'Signing out…' : 'Log out & link another account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearPendingWhatsAppSignup();
                        onNavigate('/home');
                      }}
                      disabled={submitting}
                      className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                    >
                      Cancel & stay on this account
                    </button>
                  </div>
                ) : linkExpired ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-well/60 p-4 text-sm space-y-1">
                      <div className="text-xs text-ink-500">Signed in account</div>
                      <div className="font-semibold text-ink-900">{authenticatedName}</div>
                      {authenticatedEmail && <div className="text-xs text-ink-600">{authenticatedEmail}</div>}
                    </div>

                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}

                    {resendMessage && (
                      <div className={`rounded-lg border px-4 py-3 text-sm ${
                        resendState === 'sent'
                          ? 'border-tealbrand-600/30 bg-tealbrand-50 text-tealbrand-800'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}>
                        {resendMessage}
                      </div>
                    )}

                    {resendState !== 'window-closed' && (
                      <button
                        type="button"
                        onClick={handleResendLinkToWhatsApp}
                        disabled={resendingLink}
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`h-4 w-4 ${resendingLink ? 'animate-spin' : ''}`} />
                        {resendingLink
                          ? 'Sending New Link to WhatsApp…'
                          : resendState === 'sent'
                            ? 'Resend Link Again'
                            : 'Send New Link to WhatsApp'}
                      </button>
                    )}
                    <a
                      href={resendState === 'sent' ? resendChatUrl : `${resendChatUrl}?text=${encodeURIComponent('Resend link')}`}
                      className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                        resendState === 'window-closed'
                          ? 'bg-tealbrand-600 hover:bg-tealbrand-700 text-white'
                          : 'border border-border bg-white hover:bg-well text-ink-800'
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {resendState === 'sent' ? 'Open Uncedo on WhatsApp' : 'Request New Link on WhatsApp'}
                    </a>
                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      disabled={submitting || resendingLink}
                      className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                    >
                      Sign out and use another account
                    </button>
                  </div>
                ) : inspection?.status === 'already-linked-to-you' ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-tealbrand-600/30 bg-tealbrand-50 p-4 space-y-2">
                      <div className="flex items-start gap-2.5 text-tealbrand-900">
                        <CheckCircle2 className="h-5 w-5 text-tealbrand-600 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-sm">
                          <div className="font-semibold">WhatsApp is already connected</div>
                          <p className="text-tealbrand-800">
                            <span className="font-medium">{authenticatedEmail}</span> is already linked to{' '}
                            <span className="font-mono font-medium">{displayPhone || 'this WhatsApp number'}</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => finishSuccessfulLink({ confirmationSent: true }, 'Your helper account is connected to WhatsApp.')}
                      className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors"
                    >
                      Continue to Helper Onboarding
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                    >
                      Log out & use another account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-well/60 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-tealbrand-700">
                        <ShieldCheck className="h-4 w-4" />
                        Authenticated account
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div>
                          <div className="text-xs text-ink-500">Full name</div>
                          <div className="font-semibold text-ink-900">{authenticatedName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-ink-500">Email address</div>
                          <div className="font-medium text-ink-900">{authenticatedEmail}</div>
                        </div>
                        {displayPhone && (
                          <div>
                            <div className="text-xs text-ink-500">WhatsApp number to link</div>
                            <div className="font-mono font-medium text-ink-900">{displayPhone}</div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-ink-600 pt-1 border-t border-border/80">
                        Do you confirm that this is the account you want to link to WhatsApp?
                      </p>
                    </div>

                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleConfirmLinkCurrentSession}
                      disabled={submitting}
                      className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      {submitting ? 'Linking Account to WhatsApp…' : 'Yes, link this account'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      disabled={submitting}
                      className="w-full py-2.5 px-4 rounded-lg border border-border bg-white hover:bg-well text-sm font-medium text-ink-700"
                    >
                      No, log out and use another account
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {linkExpired ? (
                  <div className="space-y-3">
                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}
                    {resendMessage && (
                      <div className={`rounded-lg border px-4 py-3 text-sm ${
                        resendState === 'sent'
                          ? 'border-tealbrand-600/30 bg-tealbrand-50 text-tealbrand-800'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}>
                        {resendMessage}
                      </div>
                    )}
                    {resendState !== 'window-closed' && (
                      <button
                        type="button"
                        onClick={handleResendLinkToWhatsApp}
                        disabled={resendingLink}
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`h-4 w-4 ${resendingLink ? 'animate-spin' : ''}`} />
                        {resendingLink
                          ? 'Sending New Link to WhatsApp…'
                          : resendState === 'sent'
                            ? 'Resend Link Again'
                            : 'Send New Link to WhatsApp'}
                      </button>
                    )}
                    <a
                      href={resendState === 'sent' ? resendChatUrl : `${resendChatUrl}?text=${encodeURIComponent('Resend link')}`}
                      className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                        resendState === 'window-closed'
                          ? 'bg-tealbrand-600 hover:bg-tealbrand-700 text-white'
                          : 'border border-border bg-white hover:bg-well text-ink-800'
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {resendState === 'sent' ? 'Open Uncedo on WhatsApp' : 'Request New Link on WhatsApp'}
                    </a>
                  </div>
                ) : (
                  <>
                    {mode === 'signup' && (
                      <div>
                        <label htmlFor="authFullName" className="block text-sm font-medium text-ink-900 mb-1.5">
                          Full name
                        </label>
                        <div className="relative">
                          <User className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="authFullName"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Thabo Mokoena"
                            className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {(mode === 'signup' || Boolean(displayPhone)) && (
                      <div>
                        <label htmlFor="authPhone" className="block text-sm font-medium text-ink-900 mb-1.5">
                          WhatsApp mobile number
                        </label>
                        <div className="relative">
                          <Phone className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="authPhone"
                            type="tel"
                            value={displayPhone}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+27 71 234 5678"
                            readOnly={Boolean(hashInfo.phone || inspection?.phoneNumber)}
                            className={`w-full rounded-lg border border-border pl-10 pr-3.5 py-2.5 text-sm tabular-nums-mono text-ink-900 focus:border-tealbrand-600 focus:outline-none ${
                              hashInfo.phone || inspection?.phoneNumber ? 'bg-well text-ink-700' : 'bg-white'
                            }`}
                            required={mode === 'signup'}
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="authEmail" className="block text-sm font-medium text-ink-900 mb-1.5">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="authEmail"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="authPassword" className="block text-sm font-medium text-ink-900 mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="authPassword"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your account password'}
                          minLength={6}
                          className="w-full rounded-lg border border-border bg-white pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      {submitting
                        ? (mode === 'signup'
                          ? (hashInfo.token ? 'Creating Account & Linking WhatsApp…' : 'Creating Account…')
                          : (hashInfo.token ? 'Signing In & Linking WhatsApp…' : 'Signing In…'))
                        : (mode === 'signup'
                          ? (hashInfo.token ? 'Create Account & Link WhatsApp' : 'Create Account & Start Onboarding')
                          : (hashInfo.token ? 'Sign In & Link WhatsApp' : 'Sign In & Continue Onboarding'))}
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
