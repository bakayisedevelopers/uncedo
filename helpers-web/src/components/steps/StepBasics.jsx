import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, User } from 'lucide-react';
import { requireE164PhoneNumber, updateHelperBasics } from '../../services/helperDataService';

export function StepBasics({ user, profile, onCompleteNext }) {
  const existingPhone = String(profile?.whatsappPhoneNumber || profile?.phoneNumber || '').trim();
  const whatsappVerified = Boolean(profile?.whatsappVerifiedAt && profile?.whatsappPhoneNumber);

  const [firstName, setFirstName] = useState(profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.lastName || '');
  const [providerType, setProviderType] = useState(
    ['individual', 'business'].includes(String(profile?.providerType || '').toLowerCase())
      ? String(profile.providerType).toLowerCase()
      : 'individual',
  );
  const [businessName, setBusinessName] = useState(profile?.businessName || '');
  const [homeAddress, setHomeAddress] = useState(profile?.homeAddress || '');
  const [city, setCity] = useState(profile?.city || 'Johannesburg');
  const [phoneNumber, setPhoneNumber] = useState(existingPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    const derivedFirst = profile?.firstName || String(profile?.fullName || '').trim().split(/\s+/)[0] || '';
    const derivedLast = profile?.lastName || String(profile?.fullName || '').trim().split(/\s+/).slice(1).join(' ') || '';
    setFirstName((prev) => prev || derivedFirst);
    setLastName((prev) => prev || derivedLast);
    if (profile?.providerType) setProviderType(String(profile.providerType).toLowerCase());
    if (profile?.businessName) setBusinessName(profile.businessName);
    if (profile?.homeAddress) setHomeAddress(profile.homeAddress);
    if (profile?.city) setCity(profile.city);
    if (existingPhone) setPhoneNumber(existingPhone);
  }, [existingPhone, profile?.businessName, profile?.city, profile?.firstName, profile?.fullName, profile?.homeAddress, profile?.lastName, profile?.providerType]);

  const handleSave = async (event, advance = true) => {
    if (event) event.preventDefault();
    setError('');
    setSavedNotice('');

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanAddress = homeAddress.trim();
    const cleanBusiness = businessName.trim();
    const cleanCity = city.trim() || 'Johannesburg';

    if (!cleanFirst || !cleanLast) {
      setError('Enter both your first name and last name.');
      return;
    }
    if (!['individual', 'business'].includes(providerType)) {
      setError('Choose whether you operate as an individual helper or a business.');
      return;
    }
    if (providerType === 'business' && cleanBusiness.length < 2) {
      setError('Enter your registered or trading business name.');
      return;
    }
    if (cleanAddress.length < 5) {
      setError('Enter your full street or home address.');
      return;
    }

    let safePhone = existingPhone;
    if (!whatsappVerified) {
      try {
        safePhone = requireE164PhoneNumber(phoneNumber);
      } catch (phoneErr) {
        setError(phoneErr.message);
        return;
      }
    }

    setSaving(true);
    try {
      const updates = {
        firstName: cleanFirst,
        lastName: cleanLast,
        fullName: `${cleanFirst} ${cleanLast}`.trim(),
        displayName: `${cleanFirst} ${cleanLast}`.trim(),
        providerType,
        businessName: providerType === 'business' ? cleanBusiness : '',
        homeAddress: cleanAddress,
        city: cleanCity,
      };
      if (!whatsappVerified && safePhone && safePhone !== existingPhone) {
        updates.phoneNumber = safePhone;
      }
      await updateHelperBasics(user.uid, updates);
      setSavedNotice('Profile basics saved.');
      if (advance) {
        onCompleteNext?.();
      }
    } catch (err) {
      setError(err?.message || 'Could not save your profile basics. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => handleSave(e, true)} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-ink-900 mb-1.5">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Thabo"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
            required
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-ink-900 mb-1.5">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Mokoena"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
            required
          />
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-ink-900 mb-2">
          Provider type
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              id: 'individual',
              title: 'Individual Helper',
              desc: 'You provide services personally under your own name.',
              Icon: User,
            },
            {
              id: 'business',
              title: 'Service Business',
              desc: 'You operate under a registered or trading business name.',
              Icon: Building2,
            },
          ].map(({ id, title, desc, Icon }) => {
            const active = providerType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setProviderType(id)}
                className={`text-left p-4 rounded-lg border transition-colors flex items-start gap-3 ${
                  active
                    ? 'border-tealbrand-600 bg-tealbrand-50/70'
                    : 'border-border bg-white hover:bg-well/60'
                }`}
              >
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${active ? 'text-tealbrand-700' : 'text-ink-400'}`} />
                <div>
                  <div className="text-sm font-semibold text-ink-900">{title}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {providerType === 'business' && (
        <div>
          <label htmlFor="businessName" className="block text-sm font-medium text-ink-900 mb-1.5">
            Registered or trading business name
          </label>
          <input
            id="businessName"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Mokoena Home Services (Pty) Ltd"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
            required
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="homeAddress" className="block text-sm font-medium text-ink-900 mb-1.5">
            Home or base street address
          </label>
          <input
            id="homeAddress"
            type="text"
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            placeholder="Street number, suburb, postal code"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
            required
          />
        </div>
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-ink-900 mb-1.5">
            City / Metro
          </label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Johannesburg"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
          />
        </div>
      </div>

      <div>
        <label htmlFor="whatsappPhone" className="block text-sm font-medium text-ink-900 mb-1.5">
          WhatsApp number
        </label>
        {whatsappVerified ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-tealbrand-600/30 bg-tealbrand-50/50 px-3.5 py-2.5 text-sm">
            <span className="tabular-nums-mono font-medium text-ink-900">{existingPhone}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-tealbrand-700">
              <CheckCircle2 className="h-4 w-4" />
              Verified on WhatsApp
            </span>
          </div>
        ) : (
          <>
            <input
              id="whatsappPhone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+27 71 234 5678"
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 tabular-nums-mono focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
              required
            />
            <p className="mt-1.5 text-xs text-ink-500">
              Include your international country code (e.g. +27). Used to send job offers when you go online.
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-700">
          {savedNotice}
        </div>
      )}

      <div className="pt-2 flex flex-wrap items-center justify-end gap-3 border-t border-border">
        <button
          type="button"
          onClick={() => handleSave(null, false)}
          disabled={saving}
          className="px-4 py-2.5 rounded-lg border border-border bg-white text-sm font-medium text-ink-700 hover:bg-well disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </form>
  );
}
