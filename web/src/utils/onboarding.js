export const STUDENT_PROFILE_STEPS = {
  ACADEMIC: 'academic_profile',
  PAYMENT: 'payment_setup',
};

export const TUTOR_PROFILE_STEPS = {
  AGREEMENT: 'agreement',
  QUALIFICATIONS: 'qualifications',
  PAYOUT: 'payout_setup',
  PROFILE: 'profile_setup',
};

export const TUTOR_VERIFICATION_STATUSES = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const PLATFORM_FEE_RATE = 0.27;
export const TUTOR_PAYOUT_RATE = 0.73;
export const BILLING_CURRENCY = 'ZAR';

export function getStudentOnboardingStatus(user) {
  const studentProfile = user?.studentProfile || {};
  const paymentMethods = user?.paymentMethods || [];

  const hasAcademic = Boolean(studentProfile.grade && studentProfile.curriculum && studentProfile.discoverySource);
  const hasPayment = paymentMethods.length > 0;

  if (hasAcademic && hasPayment) {
    return {
      complete: true,
      step: null,
      title: 'Student profile complete',
      message: 'You can request classes instantly.',
    };
  }

  if (!hasAcademic) {
    return {
      complete: false,
      step: STUDENT_PROFILE_STEPS.ACADEMIC,
      title: 'Complete student profile',
      message: 'Add grade, curriculum, and discovery source to continue.',
    };
  }

  return {
    complete: false,
    step: STUDENT_PROFILE_STEPS.PAYMENT,
    title: 'Add a payment method',
    message: 'Add and verify at least one card before requesting a class.',
  };
}

export function getTutorOnboardingStatus(user) {
  const tutorProfile = user?.tutorProfile || {};
  const qualifiedSubjects = Array.isArray(user?.qualifiedSubjects) ? user.qualifiedSubjects : [];
  const activeSubjects = Array.isArray(user?.activeSubjects) ? user.activeSubjects : [];
  const hasCurrentAgreement = isTutorAgreementCurrent(user?.tutorAgreement || {});
  const hasQualification = qualifiedSubjects.length > 0;
  const qualified = hasQualification;
  const hasPayout = Boolean(
    tutorProfile.payout?.bankName
    && tutorProfile.payout?.accountNumber
    && tutorProfile.payout?.accountHolder
    && tutorProfile.payout?.bankCode
    && tutorProfile.payout?.paystackRecipientCode
    && (tutorProfile.payout?.verificationStatus === 'verified' || tutorProfile.payout?.verified === true),
  );
  const hasProfile = Boolean(user?.selfieVerified && user?.selfieUrl && tutorProfile.gradesToTutor?.length && activeSubjects.length);
  if (!hasCurrentAgreement) {
    return {
      complete: false,
      step: TUTOR_PROFILE_STEPS.AGREEMENT,
      title: 'Accept the Tutor Agreement',
      message: 'Please review and accept the latest Tutor Agreement to complete your tutor profile.',
    };
  }

  if (qualified && hasPayout && hasProfile) {
    return {
      complete: true,
      verificationStatus: tutorProfile.verificationStatus || TUTOR_VERIFICATION_STATUSES.PENDING,
      step: null,
      title: 'Tutor profile complete',
      message: 'Set your online status when you are ready to teach.',
    };
  }

  if (!hasQualification || !qualified) {
    return {
      complete: false,
      step: TUTOR_PROFILE_STEPS.QUALIFICATIONS,
      title: 'Upload and pass qualification check',
      message: 'Upload results so Parakleo can verify subjects with marks of at least 60%.',
    };
  }

  if (!hasPayout) {
    return {
      complete: false,
      step: TUTOR_PROFILE_STEPS.PAYOUT,
      title: 'Add payout details',
      message: 'Add banking details so Parakleo can send your 73% payout share.',
    };
  }

  return {
    complete: false,
    step: TUTOR_PROFILE_STEPS.PROFILE,
    title: 'Complete tutor profile',
    message: 'Capture a live selfie, add grades, and choose active subjects to finish setup.',
  };
}

export function getProfileStatusByRole(user, role) {
  if (role === 'tutor') {
    return getTutorOnboardingStatus(user);
  }
  return getStudentOnboardingStatus(user);
}

export function hasCurrentTutorAgreement(user) {
  return isTutorAgreementCurrent(user?.tutorAgreement || {});
}

export function isTutorAgreementCurrent(tutorAgreement = {}) {
  const requiredVersion = String(tutorAgreement.requiredVersion || '1.0.1').trim();
  const acceptedVersion = String(tutorAgreement.acceptedVersion || '').trim();
  const acceptedCurrentVersion = tutorAgreement.currentVersionAccepted === true || tutorAgreement.acceptedCurrentVersion === true;
  return Boolean(
    acceptedCurrentVersion
      && requiredVersion
      && acceptedVersion
      && requiredVersion === acceptedVersion,
  );
}
