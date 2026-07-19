import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import SectionCard from '../../components/ui/SectionCard';
import FormField from '../../components/ui/FormField';
import LiveSelfieCapture from '../../components/app/LiveSelfieCapture';
import QualifiedSubjectsManager from '../../components/app/QualifiedSubjectsManager';
import TutorDocumentsManager from '../../components/app/TutorDocumentsManager';
import SelectField from '../../components/ui/SelectField';
import { useAuth } from '../../hooks/useAuth';
import { useLiveUserProfile } from '../../hooks/useLiveUserProfile';
import { updateUserProfile } from '../../services/userService';
import { listTutorPayoutBanks, verifyTutorPayoutAccount } from '../../services/tutorPayoutService';
import {
  getStudentOnboardingStatus,
  getTutorOnboardingStatus,
  hasCurrentTutorAgreement,
  TUTOR_VERIFICATION_STATUSES,
} from '../../utils/onboarding';
import PaymentMethodsManager from '../../components/app/PaymentMethodsManager';
import { syncStudentGrowth } from '../../services/studentGrowthService';

const PAYOUT_ACCOUNT_TYPE_OPTIONS = [
  { value: 'personal', label: 'Personal' },
];

const PAYOUT_DOCUMENT_TYPE_OPTIONS = [
  { value: 'identityNumber', label: 'South African ID number' },
  { value: 'passportNumber', label: 'Passport number' },
];

export default function OnboardingPage() {
  const { user, setUser } = useAuth();
  const { profile: liveProfile } = useLiveUserProfile(user?.uid);
  const currentUser = liveProfile || user;
  const [searchParams] = useSearchParams();
  const queryRole = searchParams.get('role');
  const role = queryRole === 'tutor' ? 'tutor' : 'student';
  const [statusMessage, setStatusMessage] = useState('');
  const [isSavingTutorProfile, setIsSavingTutorProfile] = useState(false);
  const [payoutBanks, setPayoutBanks] = useState([]);
  const [selectedPayoutBankCode, setSelectedPayoutBankCode] = useState(currentUser?.tutorProfile?.payout?.bankCode || '');
  const [payoutDocumentType, setPayoutDocumentType] = useState(currentUser?.tutorProfile?.payout?.documentType || 'identityNumber');

  const studentStatus = useMemo(() => getStudentOnboardingStatus(currentUser), [currentUser]);
  const tutorStatus = useMemo(() => getTutorOnboardingStatus(currentUser), [currentUser]);
  const selectedPayoutBank = payoutBanks.find((bank) => bank.code === selectedPayoutBankCode)
    || (currentUser?.tutorProfile?.payout?.bankCode === selectedPayoutBankCode
      ? {
        name: currentUser?.tutorProfile?.payout?.bankName || '',
        code: selectedPayoutBankCode,
      }
      : null);
  const payoutDocumentNumberLabel = payoutDocumentType === 'passportNumber' ? 'Passport number' : 'South African ID number';
  const payoutVerificationState = String(currentUser?.tutorProfile?.payout?.verificationStatus || '').trim().toLowerCase();
  const payoutVerificationMessage = currentUser?.tutorProfile?.payout?.verificationMessage || '';
  const tutorAgreementAccepted = hasCurrentTutorAgreement(currentUser);

  useEffect(() => {
    if (role !== 'tutor' || !user?.uid) return undefined;

    let cancelled = false;
    listTutorPayoutBanks()
      .then((banks) => {
        if (cancelled) return;
        setPayoutBanks(banks);
        if (!selectedPayoutBankCode && banks[0]?.code) {
          setSelectedPayoutBankCode(banks[0].code);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(error.message || 'Unable to load payout banks.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [role, user?.uid]);

  useEffect(() => {
    if (role !== 'tutor') return;
    if (selectedPayoutBankCode) return;
    const existingBankCode = String(currentUser?.tutorProfile?.payout?.bankCode || '').trim();
    if (existingBankCode) {
      setSelectedPayoutBankCode(existingBankCode);
    }
  }, [currentUser?.tutorProfile?.payout?.bankCode, role, selectedPayoutBankCode]);

  const saveStudentProfile = async (event) => {
    event.preventDefault();
    if (!user?.uid) return;
    const formData = new FormData(event.currentTarget);
    try {
      const profile = await updateUserProfile(user.uid, {
        studentProfile: {
          grade: Number(formData.get('grade')) || null,
          curriculum: formData.get('curriculum')?.toString().trim() || '',
          discoverySource: formData.get('discoverySource')?.toString().trim() || '',
        },
      });
      const syncedProfile = await syncStudentGrowth().catch(() => null);

      setUser((prev) => ({ ...prev, ...profile, ...(syncedProfile || {}) }));
      setStatusMessage('Student profile details saved.');
    } catch (error) {
      setStatusMessage(error.message || 'Unable to save student profile.');
    }
  };

  const saveTutorProfile = async (event) => {
    event.preventDefault();
    if (!user?.uid) return;
    const formData = new FormData(event.currentTarget);
    if (!currentUser?.selfieVerified || !currentUser?.selfieUrl) {
      setStatusMessage('Please capture and save a live selfie before saving tutor setup.');
      return;
    }
    try {
      setIsSavingTutorProfile(true);
      setStatusMessage('Saving tutor profile details...');

      const gradesToTutor = (formData.get('gradesToTutor')?.toString() || '').split(',').map((item) => item.trim()).filter(Boolean);
      const verificationStatus = tutorAgreementAccepted && (currentUser?.qualifiedSubjects || []).length
        ? TUTOR_VERIFICATION_STATUSES.VERIFIED
        : TUTOR_VERIFICATION_STATUSES.PENDING;
      const existingTutorProfile = currentUser?.tutorProfile || {};
      const existingPayout = existingTutorProfile?.payout || {};
      const payoutInput = {
        bankName: selectedPayoutBank?.name || existingPayout.bankName || '',
        bankCode: selectedPayoutBank?.code || existingPayout.bankCode || '',
        accountNumber: formData.get('accountNumber')?.toString().trim() || '',
        accountHolder: formData.get('accountHolder')?.toString().trim() || '',
        accountType: formData.get('accountType')?.toString().trim() || 'personal',
        documentType: payoutDocumentType,
        documentNumber: formData.get('documentNumber')?.toString().trim() || '',
      };
      const nowIso = new Date().toISOString();

      const profile = await updateUserProfile(user.uid, {
        tutorProfile: {
          ...existingTutorProfile,
          gradesToTutor,
          verificationStatus,
          payout: {
            ...existingPayout,
            ...payoutInput,
            verified: false,
            verificationStatus: 'pending',
            verificationMessage: 'Verification in progress.',
            verificationCheckedAt: nowIso,
          },
        },
      });

      setUser((prev) => ({ ...prev, ...profile }));

      if (!payoutInput.bankCode || !payoutInput.bankName) {
        const profileWithoutBankVerification = await updateUserProfile(user.uid, {
          tutorProfile: {
            ...((profile?.tutorProfile) || existingTutorProfile),
            payout: {
              ...((((profile?.tutorProfile) || existingTutorProfile)?.payout) || {}),
              verificationStatus: 'unverified',
              verificationMessage: 'Select a bank and re-save to verify payout details.',
              verificationCheckedAt: new Date().toISOString(),
            },
          },
        });
        setUser((prev) => ({ ...prev, ...profileWithoutBankVerification }));
        setStatusMessage('Tutor profile and bank details saved. Select a payout bank to run verification.');
        return;
      }

      setStatusMessage('Tutor profile and bank details saved. Verifying payout account details...');

      try {
        const verifiedPayout = await verifyTutorPayoutAccount(payoutInput);
        const profileWithPayout = await updateUserProfile(user.uid, {
          tutorProfile: {
            ...(profile?.tutorProfile || existingTutorProfile),
            gradesToTutor,
            verificationStatus,
            payout: {
              ...verifiedPayout,
              verificationStatus: verifiedPayout?.verified ? 'verified' : 'unverified',
              verificationMessage: verifiedPayout?.validationMessage || 'Payout details verified successfully.',
              verificationCheckedAt: new Date().toISOString(),
            },
          },
        });
        setUser((prev) => ({ ...prev, ...profileWithPayout }));
        setStatusMessage('Tutor profile and bank details saved. Payout account verified.');
      } catch (verificationError) {
        const profileWithVerificationFailure = await updateUserProfile(user.uid, {
          tutorProfile: {
            ...(profile?.tutorProfile || existingTutorProfile),
            gradesToTutor,
            verificationStatus,
            payout: {
              ...((((profile?.tutorProfile) || existingTutorProfile)?.payout) || {}),
              verified: false,
              verificationStatus: 'unverified',
              verificationMessage: verificationError.message || 'Unable to verify payout account.',
              verificationCheckedAt: new Date().toISOString(),
            },
          },
        });
        setUser((prev) => ({ ...prev, ...profileWithVerificationFailure }));
        setStatusMessage(
          verificationError.message
            || 'Tutor profile and banking details saved, but verification failed.',
        );
      }
    } catch (error) {
      setStatusMessage(error.message || 'Unable to save tutor profile.');
    } finally {
      setIsSavingTutorProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Complete Your Profile" description="Profile and payment completion is required before live requests and tutoring." />

      {statusMessage ? <p className="rounded-2xl border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-700">{statusMessage}</p> : null}

      {role === 'student' ? (
        <>
          <SectionCard title="Student setup" subtitle={studentStatus.message}>
            <form className="grid gap-4 md:grid-cols-3" onSubmit={saveStudentProfile}>
              <FormField label="Grade" name="grade" type="number" min="1" max="12" defaultValue={currentUser?.studentProfile?.grade ?? ''} placeholder="11" required />
              <FormField label="Curriculum" name="curriculum" defaultValue={currentUser?.studentProfile?.curriculum || ''} placeholder="CAPS" required />
              <FormField
                label="How did you hear about us?"
                name="discoverySource"
                defaultValue={currentUser?.studentProfile?.discoverySource || ''}
                placeholder="Instagram"
                required
              />
              <div className="md:col-span-3">
                <button type="submit" className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white">Save student profile</button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Payment methods (Paystack)">
            <PaymentMethodsManager user={user} setUser={setUser} onMessage={setStatusMessage} />
          </SectionCard>
        </>
      ) : (
        <SectionCard title="Tutor setup" subtitle={tutorStatus.message}>
          {!tutorAgreementAccepted ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Please review and accept the latest Tutor Agreement to complete your tutor profile.{' '}
              <a className="font-semibold underline" href="/app/tutor/agreement">Open agreement</a>
            </div>
          ) : null}
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveTutorProfile}>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Live selfie verification</label>
              <LiveSelfieCapture user={currentUser} setUser={setUser} onMessage={setStatusMessage} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Result documents</label>
              <TutorDocumentsManager user={currentUser} onMessage={setStatusMessage} />
            </div>
            <FormField
              label="Grades to tutor (comma separated)"
              name="gradesToTutor"
              defaultValue={(currentUser?.tutorProfile?.gradesToTutor || []).join(', ')}
              placeholder="Grade 8, Grade 9"
              required
            />
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Subjects you qualify to tutor</label>
              <QualifiedSubjectsManager user={currentUser} setUser={setUser} onMessage={setStatusMessage} />
            </div>
            <SelectField
              label="Bank"
              name="bankCode"
              value={selectedPayoutBankCode}
              onChange={(event) => setSelectedPayoutBankCode(event.target.value)}
              options={[
                { value: '', label: payoutBanks.length ? 'Select bank' : 'Loading banks...' },
                ...payoutBanks.map((bank) => ({ value: bank.code, label: bank.name })),
              ]}
              required
            />
            <FormField label="Account number" name="accountNumber" defaultValue={currentUser?.tutorProfile?.payout?.accountNumber || ''} required />
            <FormField label="Account holder" name="accountHolder" defaultValue={currentUser?.tutorProfile?.payout?.accountHolder || ''} required />
            <SelectField label="Account type" name="accountType" defaultValue={currentUser?.tutorProfile?.payout?.accountType || 'personal'} options={PAYOUT_ACCOUNT_TYPE_OPTIONS} required />
            <SelectField
              label="Verification document"
              name="documentType"
              value={payoutDocumentType}
              onChange={(event) => setPayoutDocumentType(event.target.value)}
              options={PAYOUT_DOCUMENT_TYPE_OPTIONS}
              required
            />
            <FormField label={payoutDocumentNumberLabel} name="documentNumber" defaultValue={currentUser?.tutorProfile?.payout?.documentNumber || ''} required />
            <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <span className="font-semibold">Payout verification status:</span>{' '}
              {payoutVerificationState === 'verified' ? 'Verified' : (payoutVerificationState || 'unverified')}
              {payoutVerificationMessage ? (
                <p className="mt-1 text-xs text-zinc-600">{payoutVerificationMessage}</p>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={isSavingTutorProfile} className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {isSavingTutorProfile ? 'Verifying payout details...' : 'Save tutor profile'}
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
