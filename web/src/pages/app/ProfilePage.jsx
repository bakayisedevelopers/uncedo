import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import SectionCard from '../../components/ui/SectionCard';
import PageHeader from '../../components/ui/PageHeader';
import TutorMetricTile from '../../components/app/TutorMetricTile';
import FormField from '../../components/ui/FormField';
import LiveSelfieCapture from '../../components/app/LiveSelfieCapture';
import QualifiedSubjectsManager from '../../components/app/QualifiedSubjectsManager';
import ReferralShareButton from '../../components/app/ReferralShareButton';
import TutorDocumentsManager from '../../components/app/TutorDocumentsManager';
import { LegalLinksList } from '../../components/legal/LegalLinks';
import { useAuth } from '../../hooks/useAuth';
import { useLiveUserProfile } from '../../hooks/useLiveUserProfile';
import { getStudentOnboardingStatus, getTutorOnboardingStatus, hasCurrentTutorAgreement } from '../../utils/onboarding';
import { getUserProfile, updateUserProfile } from '../../services/userService';

export default function ProfilePage() {
  const { user, logout, deleteAccount, setUser } = useAuth();
  const { profile: liveProfile } = useLiveUserProfile(user?.uid);
  const currentUser = liveProfile || user;
  const navigate = useNavigate();
  const studentStatus = getStudentOnboardingStatus(currentUser);
  const tutorStatus = getTutorOnboardingStatus(currentUser);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phoneNumber: '',
    bio: '',
    availability: '',
  });

  useEffect(() => {
    if (!user?.uid) return;

    getUserProfile(user.uid).then((profile) => {
      const profileData = profile || user;
      if (profile) {
        setUser((prev) => ({ ...prev, ...profile }));
      }
      setForm({
        fullName: profileData.fullName || profileData.displayName || '',
        phoneNumber: profileData.phoneNumber || '',
        bio: profileData.bio || '',
        availability: profileData.availability || '',
      });
    });
  }, [setUser, user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const removeAccount = async () => {
    if (confirmText !== 'DELETE') {
      setMessage('Type DELETE to confirm account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      await deleteAccount(user);
      setUser(null);
      navigate('/');
    } catch (error) {
      setMessage(error.message || 'Unable to delete account. You may need to sign in again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!user?.uid) return;

    setIsSaving(true);
    setMessage('');
    try {
      const updates = {
        fullName: form.fullName,
        displayName: form.fullName,
        phoneNumber: form.phoneNumber,
        bio: form.bio,
        availability: form.availability,
      };

      const profile = await updateUserProfile(user.uid, updates);
      setUser((prev) => ({ ...prev, ...profile }));
      setMessage('Profile details saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const isTutorRole = (currentUser?.activeRole || currentUser?.role) === 'tutor';
  const isTutorOnline = currentUser?.onlineStatus === 'online';
  const tutorProfileData = currentUser?.tutorProfile || {};
  const tutorAgreementAccepted = hasCurrentTutorAgreement(currentUser);
  const formatPercent = (value) => `${(Math.max(0, Number(value || 0) <= 1 ? Number(value || 0) * 100 : Number(value || 0))).toFixed(1)}%`;
  const formatDateTime = (value) => {
    if (!value) return 'Not available yet';
    const millis = typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
    if (!Number.isFinite(millis) || millis <= 0) return 'Not available yet';
    return new Date(millis).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profile & Settings" description="Manage your account, profile details, and onboarding progress in one place." />

      {!studentStatus.complete || (currentUser?.roles || []).includes('tutor') && !tutorStatus.complete ? (
        <SectionCard title="Complete profile">
          <p className="text-sm text-zinc-700">Finish required onboarding details before requesting classes or teaching online.</p>
          <Link to={`/app/onboarding?role=${(currentUser?.activeRole || currentUser?.role || 'student').toLowerCase()}`} className="mt-3 inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
            Open complete profile
          </Link>
        </SectionCard>
      ) : null}

      <SectionCard>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Full name" name="fullName" value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} required />
            <FormField label="Phone number" name="phoneNumber" value={form.phoneNumber} onChange={(event) => setForm((prev) => ({ ...prev, phoneNumber: event.target.value }))} />
          </div>
          <FormField label="Bio" name="bio" as="textarea" rows={3} value={form.bio} onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))} />
          {isTutorRole ? (
            <>
              <FormField label="Availability" name="availability" value={form.availability} onChange={(event) => setForm((prev) => ({ ...prev, availability: event.target.value }))} placeholder="Weekdays after 5pm" />
            </>
          ) : null}

          <button type="submit" disabled={isSaving} className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      </SectionCard>

      <SectionCard action={<button type="button" onClick={handleLogout} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">Log out</button>}>
        <dl className="grid gap-6 sm:grid-cols-2 text-zinc-800">
          <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt><dd className="mt-1 text-lg font-semibold">{currentUser?.email}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Role</dt><dd className="mt-1 text-lg font-semibold capitalize">{currentUser?.activeRole || currentUser?.role}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Student onboarding</dt><dd className="mt-1 text-sm">{studentStatus.complete ? 'Complete' : studentStatus.message}</dd></div>
          {isTutorRole || (currentUser?.roles || []).includes('tutor') ? (
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Tutor onboarding</dt><dd className="mt-1 text-sm">{tutorStatus.complete ? 'Complete' : tutorStatus.message}</dd></div>
          ) : null}
        </dl>
      </SectionCard>

      {isTutorRole ? (
        <>
          <SectionCard
            title="Tutor Agreement"
            subtitle={tutorAgreementAccepted ? 'Your current agreement is signed and active.' : 'Please review and accept the latest Tutor Agreement to complete your tutor profile.'}
            action={<Link to="/app/tutor/agreement" className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">Open agreement</Link>}
          >
            <div className="grid gap-3 text-sm text-zinc-700 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Current version</p>
                <p className="mt-1 font-semibold text-zinc-900">{currentUser?.tutorAgreement?.requiredVersion || '1.0.1'}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Accepted version</p>
                <p className="mt-1 font-semibold text-zinc-900">{currentUser?.tutorAgreement?.acceptedVersion || 'Not accepted yet'}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Status</p>
                <p className="mt-1 font-semibold text-zinc-900">{tutorAgreementAccepted ? 'Signed' : 'Action required'}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Tutor verification" subtitle="Capture a live selfie and upload results so Parakleo can verify your subject eligibility.">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-bold text-zinc-800">Live selfie</h3>
                <LiveSelfieCapture user={currentUser} setUser={setUser} onMessage={setMessage} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold text-zinc-800">Result documents</h3>
                <TutorDocumentsManager user={currentUser} onMessage={setMessage} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Subjects you qualify to tutor" subtitle="Choose which verified subjects you want active for tutor matching.">
            <QualifiedSubjectsManager user={currentUser} setUser={setUser} onMessage={setMessage} />
          </SectionCard>

          {isTutorOnline ? (
            <SectionCard title="Dispatch metrics" subtitle="These values are used when ranking tutors for incoming requests.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <TutorMetricTile
                  label="Acceptance rate"
                  value={formatPercent(tutorProfileData.acceptanceRate ?? user?.acceptanceRate)}
                />
                <TutorMetricTile
                  label="Completion rate"
                  value={formatPercent(tutorProfileData.completionRate ?? user?.completionRate)}
                />
                <TutorMetricTile
                  label="Tutor rating"
                  value={Number(tutorProfileData.overallRating ?? user?.ratings?.asTutor?.average ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span>{Number(tutorProfileData.overallRating ?? user?.ratings?.asTutor?.average).toFixed(2)}</span>
                    </span>
                  ) : 'Not rated yet'}
                />
                <TutorMetricTile
                  label="Avg response speed"
                  value={Number(tutorProfileData.avgResponseSeconds ?? user?.avgResponseSeconds ?? 0) > 0
                    ? `${Number(tutorProfileData.avgResponseSeconds ?? user?.avgResponseSeconds).toFixed(0)}s`
                    : 'Not available yet'}
                />
                <TutorMetricTile
                  label="Cancellation rate"
                  value={formatPercent(tutorProfileData.cancellationRate ?? user?.cancellationRate)}
                />
                <TutorMetricTile
                  label="Recent assignments"
                  value={Math.max(
                    0,
                    Number(
                      tutorProfileData.recentAssignmentsCount
                      ?? user?.recentAssignmentsCount
                      ?? tutorProfileData.completedSessionsLast24Hours
                      ?? 0,
                    ),
                  ).toFixed(0)}
                />
                <TutorMetricTile
                  label="Last offer received"
                  value={formatDateTime(tutorProfileData.lastOfferAt || user?.lastOfferAt)}
                />
              </div>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {(currentUser?.activeRole || currentUser?.role) === 'student' ? (
        <SectionCard title="Free minutes & referrals" subtitle="Share your referral link to earn +15 free minutes when a referred student completes their student profile.">
          <ReferralShareButton
            referralSlug={currentUser?.referralSlug || currentUser?.referralCode}
            freeMinutesRemaining={Number(currentUser?.freeMinutesRemaining || 0)}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Legal policies" subtitle="Open the latest terms and policy documents in the app.">
        <LegalLinksList className="rounded-2xl border border-brand/15 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand/10 hover:text-brand" />
      </SectionCard>

      <SectionCard title="Delete account" subtitle="This permanently removes your profile and access.">
        <div className="space-y-3">
          <p className="text-sm text-rose-600">Type DELETE below to confirm permanent account deletion.</p>
          <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="w-full max-w-sm rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900" placeholder="Type DELETE" />
          <button type="button" onClick={removeAccount} disabled={isDeleting} className="rounded-2xl border border-rose-500/40 px-4 py-2 text-sm font-bold text-rose-600 disabled:opacity-50">
            {isDeleting ? 'Deleting account...' : 'Delete my account'}
          </button>
          {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
