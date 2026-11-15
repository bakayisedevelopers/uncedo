import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Landmark, Search, ShieldCheck, User } from 'lucide-react';
import { getHelperPayoutBanks, verifyHelperPayout } from '../../services/helperDataService';

export function StepPayoutDetails({ profile, onCompleteNext }) {
  const existingPayout = profile?.payout && typeof profile.payout === 'object' ? profile.payout : {};
  const isAlreadyVerified = Boolean(
    existingPayout.bankName
      && existingPayout.accountHolder
      && existingPayout.accountNumber
      && existingPayout.recipientCode
      && String(existingPayout.verificationStatus || '').toLowerCase() === 'verified',
  );

  const [editing, setEditing] = useState(!isAlreadyVerified);
  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankFilter, setBankFilter] = useState('');

  const [payoutType, setPayoutType] = useState(() => {
    const raw = String(existingPayout.accountType || existingPayout.type || '').toLowerCase();
    return raw === 'business' ? 'business' : 'personal';
  });
  const [bankCode, setBankCode] = useState(String(existingPayout.bankCode || ''));
  const [bankName, setBankName] = useState(String(existingPayout.bankName || ''));
  const [accountHolder, setAccountHolder] = useState(
    String(existingPayout.accountHolder || profile?.fullName || ''),
  );
  const [accountNumber, setAccountNumber] = useState(String(existingPayout.accountNumber || ''));
  const [documentType, setDocumentType] = useState(() => {
    const rawAccountType = String(existingPayout.accountType || existingPayout.type || '').toLowerCase();
    if (rawAccountType === 'business') return 'businessRegistrationNumber';
    const existingDoc = String(existingPayout.documentType || '').trim();
    if (existingDoc === 'passportNumber' || existingDoc === 'passport_number') return 'passportNumber';
    return 'identityNumber';
  });
  const [documentNumber, setDocumentNumber] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingBanks(true);
      try {
        const list = await getHelperPayoutBanks();
        if (active) setBanks(list);
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load supported South African banks.');
      } finally {
        if (active) setLoadingBanks(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isAlreadyVerified) {
      setEditing(false);
    }
  }, [isAlreadyVerified]);

  const filteredBanks = useMemo(() => {
    const q = bankFilter.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q));
  }, [banks, bankFilter]);

  const handleSelectPayoutType = (nextType) => {
    setPayoutType(nextType);
    if (nextType === 'business') {
      setDocumentType('businessRegistrationNumber');
    } else if (!['identityNumber', 'passportNumber'].includes(documentType)) {
      setDocumentType('identityNumber');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!bankCode || !bankName) {
      setError('Select your South African bank from the list.');
      return;
    }
    if (accountHolder.trim().length < 2) {
      setError('Enter the exact account holder name matching your bank account.');
      return;
    }
    const cleanAcc = accountNumber.replace(/\D/g, '');
    if (cleanAcc.length < 6) {
      setError('Enter a valid South African bank account number.');
      return;
    }
    if (documentNumber.trim().length < 5) {
      setError('Enter your SA ID number, passport number, or CIPC registration number for bank ownership verification.');
      return;
    }

    setVerifying(true);
    try {
      await verifyHelperPayout({
        accountType: payoutType,
        bankCode,
        bankName,
        accountHolder: accountHolder.trim(),
        accountNumber: cleanAcc,
        documentType,
        documentNumber: documentNumber.trim(),
      });
      setDocumentNumber('');
      setEditing(false);
      setNotice('Bank account verified and linked for weekly payouts.');
    } catch (err) {
      setError(err?.message || 'Bank account verification failed. Confirm your details match your bank records.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {isAlreadyVerified && !editing ? (
        <div className="rounded-xl border border-tealbrand-600/30 bg-tealbrand-50/50 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-tealbrand-700 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-ink-900">
                  Bank account verified with Paystack
                </div>
                <p className="text-xs text-ink-600 mt-0.5">
                  Weekly helper payouts will settle automatically into this account.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3.5 py-1.5 rounded-lg border border-border bg-white hover:bg-well text-xs font-medium text-ink-700"
            >
              Update Account
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm pt-2 border-t border-tealbrand-600/20">
            <div>
              <div className="text-xs text-ink-500">Bank</div>
              <div className="font-semibold text-ink-900 mt-0.5">{existingPayout.bankName}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500">Account Holder</div>
              <div className="font-semibold text-ink-900 mt-0.5">{existingPayout.accountHolder}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500">Account Number</div>
              <div className="tabular-nums-mono font-semibold text-ink-900 mt-0.5">
                {existingPayout.accountNumber}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <span className="block text-sm font-medium text-ink-900 mb-2">
              Bank account ownership type
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'personal',
                  title: 'Personal Cheque / Savings',
                  desc: 'Account held in your individual legal name.',
                  Icon: User,
                },
                {
                  id: 'business',
                  title: 'Business Bank Account',
                  desc: 'Account held under a registered company name.',
                  Icon: Building2,
                },
              ].map(({ id, title, desc, Icon }) => {
                const active = payoutType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectPayoutType(id)}
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

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="bankSelect" className="text-sm font-medium text-ink-900">
                South African Bank
              </label>
              <div className="relative w-full sm:w-56">
                <Search className="h-3.5 w-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  placeholder="Filter banks…"
                  className="w-full rounded-lg border border-border bg-white pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:border-tealbrand-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="relative">
              <Landmark className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="bankSelect"
                value={bankCode}
                onChange={(e) => {
                  const chosen = banks.find((b) => b.code === e.target.value);
                  setBankCode(chosen?.code || '');
                  setBankName(chosen?.name || '');
                }}
                disabled={loadingBanks}
                className="w-full rounded-lg border border-border bg-white pl-10 pr-4 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                required
              >
                <option value="">
                  {loadingBanks ? 'Loading South African banks…' : 'Choose your bank'}
                </option>
                {filteredBanks.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="accountHolder" className="block text-sm font-medium text-ink-900 mb-1.5">
                Account holder name
              </label>
              <input
                id="accountHolder"
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Exact name registered with bank"
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                required
              />
            </div>
            <div>
              <label htmlFor="accountNumber" className="block text-sm font-medium text-ink-900 mb-1.5">
                Account number
              </label>
              <input
                id="accountNumber"
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="e.g. 62812345678"
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 tabular-nums-mono focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="documentType" className="block text-sm font-medium text-ink-900 mb-1.5">
                Verification document
              </label>
              <select
                id="documentType"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none"
              >
                {payoutType === 'personal' ? (
                  <>
                    <option value="identityNumber">SA ID Number</option>
                    <option value="passportNumber">Passport Number</option>
                  </>
                ) : (
                  <option value="businessRegistrationNumber">Business Registration Number</option>
                )}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="documentNumber" className="block text-sm font-medium text-ink-900 mb-1.5">
                Document / registration number
              </label>
              <input
                id="documentNumber"
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder={
                  documentType === 'businessRegistrationNumber'
                    ? 'e.g. 2021/123456/07'
                    : documentType === 'passportNumber'
                      ? 'Passport number'
                      : '13-digit South African ID number'
                }
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink-900 tabular-nums-mono focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
                required
              />
              <p className="mt-1 text-xs text-ink-500 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-tealbrand-700 shrink-0" />
                Only the last 4 digits are retained after Paystack verifies account ownership.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {isAlreadyVerified && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg border border-border bg-white text-sm font-medium text-ink-700 hover:bg-well"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={verifying || loadingBanks}
              className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {verifying ? 'Verifying with Bank…' : 'Verify & Link Bank Account'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-700">
          {notice}
        </div>
      )}

      <div className="pt-2 flex items-center justify-end border-t border-border">
        <button
          type="button"
          onClick={() => onCompleteNext?.()}
          disabled={!isAlreadyVerified || verifying}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue to Verification Status
        </button>
      </div>
    </div>
  );
}
