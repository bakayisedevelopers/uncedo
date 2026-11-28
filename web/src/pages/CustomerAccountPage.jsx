import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { AuthMessage } from '../components/AuthMessage';

const INDIVIDUAL_TYPES = ['Homeowner', 'Tenant', 'Family representative', 'Event organizer', 'Guest house / accommodation owner', 'Other'];
const BUSINESS_TYPES = ['Catering', 'Mechanic', 'Salon / beauty', 'Hospitality', 'Retail', 'Office / corporate', 'Property management', 'Events', 'Other'];

export default function CustomerAccountPage() {
  const { user, initializing, signOut, updateProfile, requestAccountDeletion, reactivateAccount } = useAuth();
  const profile = user?.profile || {};
  const customer = profile.customerProfile || {};
  const whatsappAuthenticated = user?.whatsappAuthenticated === true;
  const authenticatedWhatsAppNumber = profile.whatsappPhoneNumber || user?.firebaseUser?.phoneNumber || profile.phoneNumber || '';
  const isPendingDeletion = String(profile.accountStatus || '').trim().toLowerCase() === 'pending_deletion';
  const deletionDateLabel = profile.deletionScheduledAtMs
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.deletionScheduledAtMs))
    : 'in 30 days';
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [accountType, setAccountType] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [discoverySource, setDiscoverySource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState('');

  useEffect(() => {
    setFullName(profile.fullName || profile.displayName || '');
    setPhoneNumber(profile.phoneNumber || '');
    setAccountType(customer.accountType || '');
    setCustomerType(customer.customerType || '');
    setBusinessName(customer.businessName || '');
    setBusinessEmail(customer.businessEmail || profile.email || '');
    setBusinessCategory(customer.businessCategory || '');
    setServiceAddress(customer.serviceAddress || '');
    setDiscoverySource(customer.discoverySource || profile.studentProfile?.discoverySource || '');
  }, [profile.uid]);

  const profileComplete = useMemo(() => Boolean(
    fullName.trim() && (whatsappAuthenticated || phoneNumber.trim()) && serviceAddress.trim() && discoverySource.trim()
      && (accountType === 'individual' ? customerType : accountType === 'business' ? businessName.trim() && businessEmail.trim() && businessCategory : false),
  ), [accountType, businessCategory, businessEmail, businessName, customerType, discoverySource, fullName, phoneNumber, serviceAddress, whatsappAuthenticated]);

  if (initializing) return <Loading />;
  if (!user) return <Navigate to="/sign-in" replace />;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateProfile({
        fullName: fullName.trim(),
        displayName: fullName.trim(),
        phoneNumber: whatsappAuthenticated ? authenticatedWhatsAppNumber : phoneNumber.trim(),
        customerProfile: {
          ...customer,
          accountType,
          customerType: accountType === 'individual' ? customerType : '',
          businessName: accountType === 'business' ? businessName.trim() : '',
          businessEmail: accountType === 'business' ? businessEmail.trim() : '',
          businessCategory: accountType === 'business' ? businessCategory : '',
          serviceAddress: serviceAddress.trim(),
          discoverySource: discoverySource.trim(),
          preferredServiceCategories: Array.isArray(customer.preferredServiceCategories) ? customer.preferredServiceCategories : [],
        },
      });
      setNotice('Your customer profile details have been saved.');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save your profile.');
    } finally {
      setBusy(false);
    }
  }

  async function handleScheduleDeletion() {
    setDeletionError('');
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeletionError('Type DELETE in uppercase to schedule account deletion.');
      return;
    }
    setDeletionBusy(true);
    try {
      await requestAccountDeletion({ reason: deleteReason.trim() });
      await signOut().catch(() => null);
    } catch (nextError) {
      setDeletionError(nextError?.message || 'Unable to schedule account deletion right now.');
    } finally {
      setDeletionBusy(false);
    }
  }

  async function handleReactivate() {
    setDeletionError('');
    setDeletionBusy(true);
    try {
      await reactivateAccount();
      setNotice('Your account has been reactivated and the 30-day scheduled deletion was canceled.');
    } catch (nextError) {
      setDeletionError(nextError?.message || 'Unable to reactivate your account right now.');
    } finally {
      setDeletionBusy(false);
    }
  }

  return (
    <MainLayout>
      <main className="mx-auto min-h-[75vh] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Customer profile</p>
            <h1 className="mt-2 text-3xl font-black text-zinc-900">Welcome, {profile.fullName || profile.displayName || 'customer'}</h1>
            <p className="mt-2 text-sm text-zinc-600">{profile.email || user.firebaseUser?.email}</p>
          </div>
          <button type="button" onClick={() => signOut()} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Sign out</button>
        </div>

        {isPendingDeletion ? (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-lg font-black text-red-950">Account scheduled for deletion on {deletionDateLabel}</h2>
                <p className="mt-1 text-sm leading-6 text-red-900">
                  Your account is in a 30-day grace period and cannot place new bookings. Cancel deletion now to restore your account immediately.
                </p>
                {deletionError ? <p className="mt-2 text-sm font-semibold text-red-800">{deletionError}</p> : null}
              </div>
              <button
                type="button"
                disabled={deletionBusy}
                onClick={handleReactivate}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {deletionBusy ? 'Reactivating…' : 'Cancel deletion & reactivate'}
              </button>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={save} className="app-surface space-y-4 p-6 sm:p-8">
            <h2 className="text-xl font-black text-zinc-900">Complete your customer details</h2>
            <AuthMessage text={error} />
            <AuthMessage text={notice} tone="info" />
            <Field label="Full name" value={fullName} onChange={setFullName} required />
            {whatsappAuthenticated ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <span className="font-bold">WhatsApp verified</span>
                <span className="mt-1 block">{authenticatedWhatsAppNumber || 'Your WhatsApp identity is verified.'}</span>
              </div>
            ) : (
              <Field label="WhatsApp number" value={phoneNumber} onChange={setPhoneNumber} type="tel" placeholder="+27 71 234 5678" required />
            )}
            <label className="block space-y-1.5 text-sm font-semibold text-zinc-700">
              <span>Account type</span>
              <select value={accountType} onChange={(event) => setAccountType(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3" required>
                <option value="">Choose an account type</option>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </label>
            {accountType === 'individual' ? (
              <SelectField label="Customer type" value={customerType} onChange={setCustomerType} options={INDIVIDUAL_TYPES} />
            ) : null}
            {accountType === 'business' ? (
              <>
                <Field label="Business name" value={businessName} onChange={setBusinessName} required />
                <Field label="Business email" value={businessEmail} onChange={setBusinessEmail} type="email" required />
                <SelectField label="Business category" value={businessCategory} onChange={setBusinessCategory} options={BUSINESS_TYPES} />
              </>
            ) : null}
            <Field label="Address or service location" value={serviceAddress} onChange={setServiceAddress} required />
            <Field label="How did you hear about Uncedo?" value={discoverySource} onChange={setDiscoverySource} required />
            <button disabled={busy || !profileComplete} className="w-full rounded-2xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </form>

          <aside className="space-y-4">
            <section className="app-surface p-6">
              <h2 className="font-black text-zinc-900">Profile status</h2>
              <p className={`mt-3 text-sm font-bold ${profileComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
                {profileComplete ? 'Profile details complete' : 'More details needed'}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Your profile details are shared with the Uncedo customer app.</p>
            </section>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-black text-amber-950">Payment setup</h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">The customer app still requires a verified card before requesting a service. This website does not change or replace that existing payment flow.</p>
              {Array.isArray(profile.paymentMethods) && profile.paymentMethods.length ? (
                <p className="mt-3 text-sm font-bold text-emerald-800">A payment method is already saved on your account.</p>
              ) : null}
            </section>
            {!isPendingDeletion ? (
              <section className="rounded-2xl border border-red-200 bg-white p-6 space-y-3">
                <h2 className="font-black text-zinc-900">Delete account</h2>
                <p className="text-sm leading-6 text-zinc-600">
                  Your account enters a 30-day scheduled deletion window. You can sign back in or use WhatsApp anytime within 30 days to reactivate it. Completed service history stays preserved for record-keeping.
                </p>
                {deletionError ? <p className="text-sm font-semibold text-red-700">{deletionError}</p> : null}
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  placeholder="Optional reason"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500"
                />
                <button
                  type="button"
                  disabled={deletionBusy || deleteConfirmText.trim() !== 'DELETE'}
                  onClick={handleScheduleDeletion}
                  className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletionBusy ? 'Scheduling deletion…' : 'Schedule 30-day account deletion'}
                </button>
              </section>
            ) : null}
          </aside>
        </div>
      </main>
    </MainLayout>
  );
}

function Field({ label, value, onChange, ...props }) {
  return <label className="block space-y-1.5 text-sm font-semibold text-zinc-700"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" {...props} /></label>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="block space-y-1.5 text-sm font-semibold text-zinc-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3" required><option value="">Choose one</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Loading() {
  return <MainLayout><main className="mx-auto max-w-5xl px-4 py-20 text-center font-semibold text-zinc-600">Loading your account…</main></MainLayout>;
}
