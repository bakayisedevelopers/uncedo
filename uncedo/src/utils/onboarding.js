export const CUSTOMER_PROFILE_STEPS = {
  PROFILE: 'customer_profile',
  PAYMENT: 'payment_setup',
};

export const STUDENT_PROFILE_STEPS = CUSTOMER_PROFILE_STEPS;

export function getCustomerOnboardingStatus(user) {
  const legacyProfile = user?.studentProfile || {};
  const customerProfile = user?.customerProfile || {};
  const paymentMethods = Array.isArray(user?.paymentMethods) ? user.paymentMethods : [];
  const accountType = String(customerProfile.accountType || '').trim().toLowerCase();
  const baseProfileReady = Boolean(
    String(user?.fullName || user?.displayName || '').trim()
      && String(user?.phoneNumber || '').trim()
      && String(customerProfile.serviceAddress || '').trim()
      && String(customerProfile.discoverySource || legacyProfile.discoverySource || '').trim(),
  );
  const hasBusinessProfile = Boolean(
    baseProfileReady
      && accountType === 'business'
      && String(customerProfile.businessName || '').trim()
      && String(customerProfile.businessEmail || user?.email || '').trim()
      && String(customerProfile.businessCategory || '').trim(),
  );
  const hasIndividualProfile = Boolean(
    baseProfileReady
      && accountType === 'individual'
      && String(customerProfile.customerType || '').trim(),
  );
  const hasBasicProfile = hasBusinessProfile || hasIndividualProfile;
  const hasPayment = paymentMethods.length > 0;

  if (hasBasicProfile && hasPayment) {
    return {
      complete: true,
      step: null,
      title: 'Customer profile complete',
      message: 'You can request help instantly.',
    };
  }

  if (!hasBasicProfile) {
    return {
      complete: false,
      step: CUSTOMER_PROFILE_STEPS.PROFILE,
      title: 'Complete your customer profile',
      message: 'Complete your individual or business profile, then add a card before requesting help.',
    };
  }

  return {
    complete: false,
    step: CUSTOMER_PROFILE_STEPS.PAYMENT,
    title: 'Add a payment method',
    message: 'Add and verify at least one card before requesting help.',
  };
}

export const getStudentOnboardingStatus = getCustomerOnboardingStatus;
