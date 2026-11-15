export const ONBOARDING_STEPS = [
  {
    id: 'basics',
    number: '01',
    title: 'Profile Basics',
    shortTitle: 'Profile',
    summary: 'Full name, individual or business details, home address, and WhatsApp contact.',
  },
  {
    id: 'photo',
    number: '02',
    title: 'Profile Selfie',
    shortTitle: 'Selfie',
    summary: 'Clear headshot photo so customers can recognise who is arriving.',
  },
  {
    id: 'services',
    number: '03',
    title: 'Services & Portfolio',
    shortTitle: 'Services',
    summary: 'Select services and upload real photos showcasing your work.',
  },
  {
    id: 'agreement',
    number: '04',
    title: 'Helper Agreement',
    shortTitle: 'Agreement',
    summary: 'Read the active Helper Agreement and record your electronic signature.',
  },
  {
    id: 'clearance',
    number: '05',
    title: 'Police Clearance',
    shortTitle: 'Clearance',
    summary: 'Upload your valid police-clearance certificate for private admin review.',
  },
  {
    id: 'payout',
    number: '06',
    title: 'Bank Payouts',
    shortTitle: 'Payouts',
    summary: 'Verify your South African bank account for weekly helper earnings.',
  },
  {
    id: 'review',
    number: '07',
    title: 'Verification Status',
    shortTitle: 'Verification',
    summary: 'Final readiness checklist and Uncedo administrator approval status.',
  },
];

export function mapPathnameToStepId(pathname = '') {
  const clean = String(pathname || '').toLowerCase().replace(/\/+$/, '');
  if (clean === '/profile-photo') return 'photo';
  if (clean === '/service-photos') return 'services';
  if (clean === '/sign-agreement') return 'agreement';
  if (clean === '/police-clearance') return 'clearance';
  if (clean === '/payout-details') return 'payout';
  if (clean === '/verification') return 'review';
  return '';
}

export function evaluateHelperOnboarding({
  profile = {},
  offerings = [],
  catalog = [],
  clearanceReview = null,
  activeAgreement = null,
}) {
  const firstName = String(profile?.firstName || '').trim();
  const lastName = String(profile?.lastName || '').trim();
  const fullName = String(profile?.fullName || '').trim() || [firstName, lastName].filter(Boolean).join(' ');
  const providerType = String(profile?.providerType || '').trim().toLowerCase();
  const businessName = String(profile?.businessName || '').trim();
  const homeAddress = String(profile?.homeAddress || '').trim();
  const phoneNumber = String(profile?.whatsappPhoneNumber || profile?.phoneNumber || '').trim();

  const hasName = Boolean(fullName && (firstName || fullName.split(/\s+/).length >= 1));
  const hasProviderType = providerType === 'individual' || providerType === 'business';
  const hasBusinessName = providerType !== 'business' || Boolean(businessName);
  const hasAddress = homeAddress.length >= 5;
  const hasPhone = Boolean(phoneNumber);
  const basicsComplete = hasName && hasProviderType && hasBusinessName && hasAddress && hasPhone;

  const photoComplete = Boolean(String(profile?.profilePhoto || profile?.selfieUrl || '').trim());

  const catalogMap = new Map(catalog.map((item) => [String(item.id || '').toLowerCase(), item]));
  const offeringsWithPhotos = offerings.filter((item) => {
    if (String(item.status || '').toLowerCase() === 'declined' || String(item.status || '').toLowerCase() === 'removed') {
      return false;
    }
    const entry = catalogMap.get(String(item.serviceId || '').toLowerCase());
    const inherited = entry?.type === 'bundle' && entry?.inheritBundleImages !== false;
    return inherited || (Array.isArray(item.photos) && item.photos.length > 0);
  });
  const approvedOffering = offeringsWithPhotos.some(
    (item) => item.status === 'approved' && item.approved === true && item.verified === true,
  );
  const servicesComplete = offeringsWithPhotos.length > 0;

  const requiredVersion = String(
    activeAgreement?.version || profile?.agreement?.requiredVersion || profile?.agreement?.currentVersion || '',
  ).trim();
  const acceptedVersion = String(profile?.agreement?.acceptedVersion || '').trim();
  const agreementComplete = Boolean(
    acceptedVersion
      && (!requiredVersion || acceptedVersion === requiredVersion)
      && (profile?.agreement?.currentVersionAccepted === true
        || profile?.agreement?.acceptedCurrentVersion === true
        || acceptedVersion === requiredVersion),
  );

  const clearanceRequired = clearanceReview?.required ?? (profile?.policeClearanceRequired !== false);
  const clearanceStatus = String(
    clearanceReview?.status || profile?.policeClearanceStatus || 'missing',
  ).trim().toLowerCase();
  const clearanceSubmitted = !clearanceRequired || ['pending', 'uploading', 'approved'].includes(clearanceStatus);
  const clearanceApproved = !clearanceRequired || clearanceStatus === 'approved';

  const payout = profile?.payout && typeof profile.payout === 'object' ? profile.payout : {};
  const payoutComplete = Boolean(
    payout.bankName
      && payout.accountHolder
      && payout.accountNumber
      && payout.recipientCode
      && String(payout.verificationStatus || '').toLowerCase() === 'verified',
  );

  const accountVerified = String(profile?.verificationStatus || '').trim().toLowerCase() === 'verified';
  const fullyVerified =
    basicsComplete
    && photoComplete
    && approvedOffering
    && agreementComplete
    && clearanceApproved
    && payoutComplete
    && accountVerified;

  const stepStates = {
    basics: {
      complete: basicsComplete,
      statusLabel: basicsComplete ? 'Completed' : 'Required',
      tone: basicsComplete ? 'done' : 'pending',
    },
    photo: {
      complete: photoComplete,
      statusLabel: photoComplete ? 'Uploaded' : 'Required',
      tone: photoComplete ? 'done' : 'pending',
    },
    services: {
      complete: servicesComplete,
      statusLabel: approvedOffering
        ? 'Approved'
        : servicesComplete
          ? 'Submitted for review'
          : offerings.length > 0
            ? 'Needs photos'
            : 'Required',
      tone: approvedOffering ? 'done' : servicesComplete ? 'review' : 'pending',
    },
    agreement: {
      complete: agreementComplete,
      statusLabel: agreementComplete ? 'Signed' : 'Required',
      tone: agreementComplete ? 'done' : 'pending',
    },
    clearance: {
      complete: clearanceSubmitted,
      statusLabel: !clearanceRequired
        ? 'Not required'
        : clearanceApproved
          ? 'Approved'
          : clearanceStatus === 'pending' || clearanceStatus === 'uploading'
            ? 'In admin review'
            : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(clearanceStatus)
              ? 'Resubmit required'
              : 'Required',
      tone: clearanceApproved ? 'done' : clearanceSubmitted ? 'review' : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(clearanceStatus) ? 'error' : 'pending',
    },
    payout: {
      complete: payoutComplete,
      statusLabel: payoutComplete ? 'Verified' : 'Required',
      tone: payoutComplete ? 'done' : 'pending',
    },
    review: {
      complete: fullyVerified,
      statusLabel: fullyVerified
        ? 'Ready to go online'
        : basicsComplete && photoComplete && servicesComplete && agreementComplete && clearanceSubmitted && payoutComplete
          ? 'Awaiting approval'
          : 'In progress',
      tone: fullyVerified ? 'done' : (basicsComplete && photoComplete && servicesComplete && agreementComplete && clearanceSubmitted && payoutComplete) ? 'review' : 'pending',
    },
  };

  const helperActionSteps = ['basics', 'photo', 'services', 'agreement', 'clearance', 'payout'];
  const completedHelperSteps = helperActionSteps.filter((id) => stepStates[id].complete).length;
  const totalSteps = ONBOARDING_STEPS.length;
  const completedTotalSteps = ONBOARDING_STEPS.filter((step) => stepStates[step.id].complete).length;
  const progressPercent = Math.round((completedTotalSteps / totalSteps) * 100);

  const recommendedStepId =
    helperActionSteps.find((id) => !stepStates[id].complete) || 'review';

  return {
    stepStates,
    completedHelperSteps,
    completedTotalSteps,
    totalSteps,
    progressPercent,
    recommendedStepId,
    allHelperStepsSubmitted: completedHelperSteps === helperActionSteps.length,
    fullyVerified,
    approvedOffering,
    clearanceRequired,
    clearanceStatus,
    accountVerified,
    whatsappLinked: Boolean(profile?.whatsappVerifiedAt && profile?.whatsappPhoneNumber),
  };
}
